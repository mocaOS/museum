import { readFileSync } from "node:fs";
import path from "node:path";
import type { Router } from "express";
import { defineEndpoint } from "@directus/extensions-sdk";
import type { Directus } from "@local/types";

export default defineEndpoint({
  id: "agents",

  handler: (router: Router, { services, getSchema }) => {
    // Shared helpers used by endpoints below
    async function getRequesterAddress(req: any): Promise<string> {
      const userId = req?.accountability?.user;
      if (!userId) throw new Error("Unauthorized");
      const schema = await getSchema();
      const { ItemsService } = services;
      const usersService = new ItemsService("directus_users", { schema, accountability: req.accountability });
      const user = await usersService.readOne(userId, { fields: [ "id", "ethereum_address" ] });
      const requesterAddress = String(user?.ethereum_address || "").toLowerCase();
      if (!requesterAddress) throw new Error("User has no ethereum_address");
      return requesterAddress;
    }

    async function verifyOwnership(tokenId: string, ownerAddress: string): Promise<boolean> {
      const graphqlEndpoint = "https://mainnet-graph.deploy.qwellco.de/subgraphs/name/moca/decc0s";
      const query = "query GetTokenByIdAndOwner($tokenId: String!, $owner: String!) { tokens(where: { tokenId: $tokenId, owner: $owner }) { tokenId owner id } }";
      const body = JSON.stringify({ query, variables: { tokenId, owner: ownerAddress } });
      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!response.ok) throw new Error(`Subgraph error: ${response.statusText}`);
      const result = await response.json();
      const tokens = result?.data?.tokens ?? [];
      return Array.isArray(tokens) && tokens.length > 0;
    }

    // Coolify constants (use fixed values, not env) and helpers (shared across routes)
    const COOLIFY_BASE_URL = "https://deploy.qwellco.de"; // no trailing slash
    const COOLIFY_API = `${COOLIFY_BASE_URL}/api/v1`;
    const COOLIFY_TOKEN = env.COOLIFY_TOKEN;
    const PROJECT_UUID = "aww04oc";
    const SERVER_UUID = "zgcgcw0";
    const ENVIRONMENT_UUID = "igkwgkcs4g84ksgs048w08kg";

    async function httpJson(method: string, url: string, body?: Record<string, unknown> | string) {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${COOLIFY_TOKEN}`,
      };
      if (body !== undefined) headers["Content-Type"] = "application/json";

      const response = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${method} ${url} -> ${response.status} ${response.statusText}: ${text}`);
      }
      const text = await response.text();
      if (!text) return undefined;
      try {
        return JSON.parse(text);
      } catch {
        return text as unknown;
      }
    }

    router.post("/:token_id/start", async (req, res) => {
      try {
        const userId = (req as any).accountability?.user;
        if (!userId) {
          return res.status(401).json({ success: false, error: "Unauthorized" });
        }

        const schema = await getSchema();
        const { ItemsService } = services;
        const usersService = new ItemsService("directus_users", { schema, accountability: (req as any).accountability });
        const user = await usersService.readOne(userId, { fields: [ "id", "ethereum_address" ] });

        const tokenId = String(req.params.token_id);
        const requesterAddress = (user?.ethereum_address || "").toLowerCase();

        // Basic validation
        if (!requesterAddress) {
          return res.status(400).json({ success: false, error: "User has no ethereum_address" });
        }

        // Query subgraph for ownership check
        const graphqlEndpoint = "https://mainnet-graph.deploy.qwellco.de/subgraphs/name/moca/decc0s";
        const query = "query GetTokenByIdAndOwner($tokenId: String!, $owner: String!) { tokens(where: { tokenId: $tokenId, owner: $owner }) { tokenId owner id } }";
        const body = JSON.stringify({ query, variables: { tokenId, owner: requesterAddress } });

        const response = await fetch(graphqlEndpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
        });

        if (!response.ok) {
          return res.status(502).json({ success: false, error: `Subgraph error: ${response.statusText}` });
        }

        const result = await response.json();
        const tokens = result?.data?.tokens ?? [];
        const isOwner = Array.isArray(tokens) && tokens.length > 0;

        if (!isOwner) {
          return res.status(403).json({ success: false, error: "Ownership not verified" });
        }

        // If ownership is verified, prepare services and Coolify helpers
        const agentsService = new ItemsService("agents", { schema });

        // Coolify constants and httpJson are defined above for reuse

        // Helper: poll app status until running → set agent.status to 'online'
        function scheduleStatusPoll(applicationUuid: string, agentId: number) {
          const interval = setInterval(async () => {
            try {
              const app = await httpJson("GET", `${COOLIFY_API}/applications/${applicationUuid}`) as { status?: string } | undefined;
              const status = typeof app?.status === "string" ? app!.status.toLowerCase() : "";
              if (status.includes("running")) {
                await agentsService.updateOne(agentId as any, { status: "online" } as Partial<Directus.Agents>);
                clearInterval(interval);
              }
            } catch (e) {
              // Ignore transient errors; keep polling
            }
          }, 5000);
        }

        // Check if agent already exists
        const existing = await agentsService.readByQuery({
          filter: { token_id: { _eq: tokenId } },
          limit: 1,
          fields: [ "id", "status", "url", "token_id", "application_id" ],
        });

        const existingAgent = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Agents : undefined;

        if (existingAgent) {
          if (existingAgent.application_id) {
            // If DB already shows agent online, don't start again
            const currentStatus = (existingAgent.status || "").toLowerCase();
            if (currentStatus === "online") {
              return res.json({ success: true, created: false, started: false, agent: existingAgent });
            }
            // If the agent is already starting, don't start again
            if (currentStatus === "starting") {
              return res.json({ success: true, created: false, started: false, agent: existingAgent });
            }
            try {
              const startUrl = `${COOLIFY_API}/applications/${existingAgent.application_id}/start?instant_deploy=true&force=false`;
              await httpJson("GET", startUrl);
              await agentsService.updateOne(existingAgent.id as any, { status: "starting" } as Partial<Directus.Agents>);
              // Begin polling status in background
              scheduleStatusPoll(existingAgent.application_id as any, existingAgent.id as any);
              const updated = await agentsService.readOne(existingAgent.id as any, { fields: [ "id", "status", "url", "token_id", "application_id" ] });
              return res.json({ success: true, created: false, started: true, agent: updated });
            } catch (e: any) {
              return res.status(502).json({ success: false, error: e?.message ?? "Failed to start existing application" });
            }
          }
          return res.status(400).json({ success: false, error: "Existing agent missing application_id" });
        }

        // Helper functions (modeled 1:1 from the Coolify script)
        function generateRandomSubdomain(prefix: string): string {
          const rand = Math.random().toString(36).slice(2, 8);
          return `${prefix}-${rand}`.toLowerCase();
        }

        function parseDotEnv(content: string): Record<string, string> {
          const envs: Record<string, string> = {};
          const lines = content.split(/\r?\n/);
          for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq <= 0) continue;
            const key = line.slice(0, eq).trim();
            let value = line.slice(eq + 1).trim();
            if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            envs[key] = value;
          }
          return envs;
        }

        // Build Coolify config (fixed constants used above)

        // Commands (1:1 from example script)
        const INSTALL_COMMAND = "/usr/local/bin/bun install --frozen-lockfile";
        const BUILD_COMMAND
          = "/usr/local/bin/bun run build --filter=@local/config --filter=moca-agent";
        const START_COMMAND = "cd /app/apps/moca-agent && /usr/local/bin/bun run start";
        const EXPOSE_PORT = 3005;
        const BUILD_PACK = "nixpacks";

        // Git values (defaults from the example script)
        const GIT_REPOSITORY = "https://github.com/mocaOS/museum.git";
        const GIT_BRANCH = "staging";

        // Domain
        const DOMAIN_SUFFIX = "deploy.qwellco.de";
        const baseName = "moca-agent";
        const subdomain = generateRandomSubdomain(baseName);
        const appName = subdomain;
        const domainHost = `${subdomain}.${DOMAIN_SUFFIX}`;
        const domainUrl = `https://${domainHost}`;

        // Create DB entry
        const createdId = await agentsService.createOne({
          token_id: tokenId,
          url: domainUrl,
        } as Partial<Directus.Agents>);

        // Fire-and-forget Coolify application creation
        (async () => {
          try {
            // Best-effort validations (as in example)
            await Promise.all([
              httpJson("GET", `${COOLIFY_API}/projects/${PROJECT_UUID}`),
              httpJson("GET", `${COOLIFY_API}/servers/${SERVER_UUID}`),
              httpJson("GET", `${COOLIFY_API}/environments/${ENVIRONMENT_UUID}`),
            ]).catch(() => undefined);

            const createPayload: Record<string, unknown> = {
              project_uuid: PROJECT_UUID,
              server_uuid: SERVER_UUID,
              environment_uuid: ENVIRONMENT_UUID,
              git_repository: GIT_REPOSITORY,
              git_branch: GIT_BRANCH,
              build_pack: BUILD_PACK,
              ports_exposes: String(EXPOSE_PORT),
              name: appName,
              description: `Agent for Token ID: ${tokenId}`,
              domains: domainUrl,
              install_command: INSTALL_COMMAND,
              build_command: BUILD_COMMAND,
              start_command: START_COMMAND,
              instant_deploy: true,
              redirect: "non-www",
              base_directory: "/",
              publish_directory: "/",
            };

            const created = await httpJson("POST", `${COOLIFY_API}/applications/public`, createPayload) as { uuid?: string } | undefined;
            const applicationUuid = created?.uuid;
            if (!applicationUuid) {
              throw new Error("Failed to create application: no UUID returned");
            }

            // Update agent record with application_id
            try {
              await agentsService.updateOne(createdId as any, { application_id: applicationUuid } as Partial<Directus.Agents>);
            } catch (e) {
              console.error("Failed to update agent with application_id for token", tokenId, e);
            }

            // Upload environment variables from apps/moca-agent/.env.staging (best-effort)
            try {
              const envFilePath = path.resolve(process.cwd(), "..", "..", "apps", "moca-agent", ".env.staging");
              const envRaw = readFileSync(envFilePath, "utf8");
              const envMap = parseDotEnv(envRaw);
              const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
              if (entries.length > 0) {
                const bulkUrl = `${COOLIFY_API}/applications/${applicationUuid}/envs/bulk`;
                const bulkBody = {
                  data: entries.map(({ key, value }) => ({
                    key,
                    value,
                    is_preview: false,
                    is_build_time: false,
                    is_literal: true,
                    is_multiline: false,
                    is_shown_once: false,
                  })),
                } as Record<string, unknown>;
                await httpJson("PATCH", bulkUrl, bulkBody);
                console.log(`Uploaded ${entries.length} environment variables to Coolify for token`, tokenId);
              } else {
                console.log("No environment variables found in .env.staging to upload.");
              }
            } catch (e) {
              console.warn("Warning: Failed to upload env vars to Coolify. You may need to set them manually.");
              console.warn(e instanceof Error ? e.message : e);
            }

            // Set status to 'starting' (Coolify auto-starts newly created apps)
            try {
              await agentsService.updateOne(createdId as any, { status: "starting" } as Partial<Directus.Agents>);
              // Begin polling status in background
              scheduleStatusPoll(applicationUuid, createdId as any);
            } catch (e) {
              console.warn("Warning: Failed to update status to 'starting' for token", tokenId);
              console.warn(e instanceof Error ? e.message : e);
            }

            console.log("Coolify application created for token", tokenId, applicationUuid);
          } catch (e) {
            console.error("Failed to create Coolify app for token", tokenId, e);
            try {
              await agentsService.deleteOne(createdId as any);
              console.log("Rolled back agent record for token", tokenId);
            } catch (rollbackErr) {
              console.error("Failed to rollback agent record for token", tokenId, rollbackErr);
            }
          }
        })();

        const agent = await agentsService.readOne(createdId as any, { fields: [ "id", "status", "url", "token_id" ] });
        return res.json({ success: true, created: true, agent });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error?.message ?? "Internal Server Error" });
      }
    });

    // Get agent URL for a token (ownership verification required)
    router.get("/:token_id/url", async (req, res) => {
      try {
        const tokenId = String(req.params.token_id || "");
        if (!tokenId) return res.status(400).json({ success: false, error: "Missing token_id" });

        // Resolve requester address (auth required)
        let requesterAddress: string;
        try {
          requesterAddress = await getRequesterAddress((req as any));
        } catch (e: any) {
          const msg = String(e?.message || "Unauthorized");
          const code = msg.includes("Unauthorized") ? 401 : 400;
          return res.status(code).json({ success: false, error: msg });
        }

        // Ownership verification via subgraph
        const isOwner = await verifyOwnership(tokenId, requesterAddress);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: "Ownership not verified" });
        }

        // Lookup agent record for URL
        const schema = await getSchema();
        const { ItemsService } = services;
        const agentsService = new ItemsService("agents", { schema });

        const existing = await agentsService.readByQuery({
          filter: { token_id: { _eq: tokenId } },
          limit: 1,
          fields: [ "id", "url", "status", "token_id" ],
        });
        const existingAgent = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Agents : undefined;

        if (!existingAgent || !existingAgent.url) {
          return res.status(404).json({ success: false, error: "Agent not found" });
        }

        return res.json({ success: true, url: existingAgent.url, agent: existingAgent });
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error?.message ?? "Internal Server Error" });
      }
    });

    // Stop an existing agent by token ID (with ownership verification and backend lookup for application_id)
    router.post("/:token_id/stop", async (req, res) => {
      try {
        // Resolve requester address (auth required)
        let requesterAddress: string;
        try {
          requesterAddress = await getRequesterAddress((req as any));
        } catch (e: any) {
          const msg = String(e?.message || "Unauthorized");
          const code = msg.includes("Unauthorized") ? 401 : 400;
          return res.status(code).json({ success: false, error: msg });
        }

        const tokenId = String(req.params.token_id || "");
        if (!tokenId) return res.status(400).json({ success: false, error: "Missing token_id" });

        const schema = await getSchema();
        const { ItemsService } = services;
        const agentsService = new ItemsService("agents", { schema });

        const existing = await agentsService.readByQuery({
          filter: { token_id: { _eq: tokenId } },
          limit: 1,
          fields: [ "id", "status", "url", "token_id", "application_id" ],
        });
        const existingAgent = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Agents : undefined;

        if (!existingAgent) {
          return res.status(404).json({ success: false, error: "Agent not found" });
        }

        const applicationId = String(existingAgent.application_id || "");
        if (!applicationId) return res.status(400).json({ success: false, error: "Agent missing application_id" });

        const isOwner = await verifyOwnership(tokenId, requesterAddress);
        if (!isOwner) {
          return res.status(403).json({ success: false, error: "Ownership not verified" });
        }

        try {
          const stopUrl = `${COOLIFY_API}/applications/${applicationId}/stop`;
          await httpJson("GET", stopUrl);
          await agentsService.updateOne(existingAgent.id as any, { status: "offline" } as Partial<Directus.Agents>);
          const updated = await agentsService.readOne(existingAgent.id as any, { fields: [ "id", "status", "url", "token_id", "application_id" ] });
          return res.json({ success: true, stopped: true, agent: updated });
        } catch (e: any) {
          return res.status(502).json({ success: false, error: e?.message ?? "Failed to stop application" });
        }
      } catch (error: any) {
        return res.status(500).json({ success: false, error: error?.message ?? "Internal Server Error" });
      }
    });
  },
});
