import { readFileSync } from "node:fs";
import path from "node:path";
import type { Router } from "express";
import { json as expressJson } from "express";
import { defineEndpoint } from "@directus/extensions-sdk";
import type { Directus } from "@local/types";

export default defineEndpoint({
  id: "applications",

  handler: (router: Router, { services, getSchema }) => {
    // Ensure JSON bodies are parsed for this endpoint
    router.use(expressJson());
    async function getRequester(req: any): Promise<{ userId: string; address: string }> {
      const userId = req?.accountability?.user;
      if (!userId) throw new Error("Unauthorized");
      const schema = await getSchema();
      const { ItemsService } = services;
      const usersService = new ItemsService("directus_users", { schema, accountability: req.accountability });
      const user = await usersService.readOne(userId, { fields: [ "id", "ethereum_address" ] });
      const address = String(user?.ethereum_address || "").toLowerCase();
      if (!address) throw new Error("User has no ethereum_address");
      return { userId, address };
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

    const COOLIFY_BASE_URL = "https://deploy.qwellco.de";
    const COOLIFY_API = `${COOLIFY_BASE_URL}/api/v1`;
    const COOLIFY_TOKEN = env.COOLIFY_TOKEN;
    const PROJECT_UUID = "aww04oc";
    const SERVER_UUID = "zgcgcw0";
    const ENVIRONMENT_UUID = "igkwgkcs4g84ksgs048w08kg";

    async function httpJson(method: string, url: string, body?: Record<string, unknown> | string) {
      const headers: Record<string, string> = { Authorization: `Bearer ${COOLIFY_TOKEN}` };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(url, { method, headers, body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
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

    function scheduleStatusPoll(applicationUuid: string, applicationsService: any, applicationId: number) {
      const interval = setInterval(async () => {
        try {
          const app = await httpJson("GET", `${COOLIFY_API}/applications/${applicationUuid}`) as { status?: string } | undefined;
          const status = typeof app?.status === "string" ? app!.status.toLowerCase() : "";
          if (status.includes("running")) {
            await applicationsService.updateOne(applicationId as any, { status: "online" } as Partial<Directus.Applications>);
            clearInterval(interval);
          }
        } catch {
          // ignore
        }
      }, 5000);
    }

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

    router.post("/start", async (req, res) => {
      try {
        // requester and tokens
        const { userId, address } = await getRequester((req as any));
        const rawBody = (req as any).body;
        const body = typeof rawBody === "string" ? (rawBody ? JSON.parse(rawBody) : {}) : (rawBody || {});
        const tokenIds: string[] = Array.isArray((body as any)?.tokenIds) ? (body as any).tokenIds.map((t: any) => String(t)) : [];
        if (!tokenIds.length) return res.status(400).json({ success: false, error: "Missing tokenIds" });

        // verify ownership for all provided tokenIds
        for (const tokenId of tokenIds) {
          const isOwner = await verifyOwnership(String(tokenId), address);
          if (!isOwner) return res.status(403).json({ success: false, error: `Ownership not verified for token ${tokenId}` });
        }

        const schema = await getSchema();
        const { ItemsService } = services;
        const applicationsService = new ItemsService("applications", { schema });

        // find existing application by owner
        const existing = await applicationsService.readByQuery({
          filter: { owner: { _eq: userId } },
          limit: 1,
          fields: [ "id", "status", "url", "application_id", "decc0s", "owner.id" ] as any,
        });

        const existingApp = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Applications : undefined;

        // constants for Coolify build
        const INSTALL_COMMAND = `/usr/local/bin/bun install --frozen-lockfile && cd /app/apps/moca-agent && /usr/local/bin/bun run generate-characters.ts ${tokenIds.join(",")}`;
        const BUILD_COMMAND = "/usr/local/bin/bun run build --filter=@local/config --filter=moca-agent";
        const START_COMMAND = "cd /app/apps/moca-agent && /usr/local/bin/bun run start";
        const EXPOSE_PORT = 3005;
        const BUILD_PACK = "nixpacks";
        const GIT_REPOSITORY = "https://github.com/mocaOS/museum.git";
        const GIT_BRANCH = "staging";
        const DOMAIN_SUFFIX = "deploy.qwellco.de";
        const baseName = "moca-agent";

        if (existingApp && (existingApp as any).application_id) {
          // update selection, update app configuration, and start existing app
          const applicationUuid = String((existingApp as any).application_id);
          const subdomain = generateRandomSubdomain(baseName);
          const domainHost = `${subdomain}.${DOMAIN_SUFFIX}`;
          const domainUrl = `https://${domainHost}`;

          try {
            try {
              const updateUrl = `${COOLIFY_API}/applications/${applicationUuid}`;
              const updatePayload: Record<string, unknown> = {
                git_branch: GIT_BRANCH,
                install_command: INSTALL_COMMAND,
                build_command: BUILD_COMMAND,
                start_command: START_COMMAND,
                ports_exposes: String(EXPOSE_PORT),
                domains: domainUrl,
              };
              await httpJson("PATCH", updateUrl, updatePayload);
            } catch {}

            // attempt to update env vars best-effort
            try {
              const envFilePath = path.resolve(process.cwd(), "..", "..", "apps", "moca-agent", ".env.staging");
              const envRaw = readFileSync(envFilePath, "utf8");
              const envMap = parseDotEnv(envRaw);
              const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
              if (entries.length > 0) {
                const bulkUrl = `${COOLIFY_API}/applications/${applicationUuid}/envs/bulk`;
                const bulkBody = {
                  data: entries.map(({ key, value }) => ({ key, value, is_preview: false, is_build_time: false, is_literal: true, is_multiline: false, is_shown_once: false })),
                } as Record<string, unknown>;
                await httpJson("PATCH", bulkUrl, bulkBody);
              }
            } catch {}

            // start existing application
            const startUrl = `${COOLIFY_API}/applications/${applicationUuid}/start?instant_deploy=true&force=false`;
            await httpJson("GET", startUrl);
            await applicationsService.updateOne((existingApp as any).id as any, { status: "starting", decc0s: tokenIds.join(","), url: domainUrl } as Partial<Directus.Applications>);
            scheduleStatusPoll(applicationUuid, applicationsService, (existingApp as any).id as any);
            const updated = await applicationsService.readOne((existingApp as any).id as any, { fields: [ "id", "status", "url", "application_id", "decc0s", "owner.id" ] as any });
            return res.json({ success: true, created: false, started: true, application: updated });
          } catch (e: any) {
            return res.status(502).json({ success: false, error: e?.message ?? "Failed to start application" });
          }
        }

        // create a new application record and Coolify app
        const subdomain = generateRandomSubdomain(baseName);
        const domainHost = `${subdomain}.${DOMAIN_SUFFIX}`;
        const domainUrl = `https://${domainHost}`;

        const createdId = await applicationsService.createOne({
          decc0s: tokenIds.join(","),
          url: domainUrl,
          owner: userId,
        } as Partial<Directus.Applications>);

        (async () => {
          try {
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
              name: subdomain,
              description: `Agents for ${address}`,
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
            if (!applicationUuid) throw new Error("Failed to create application: no UUID returned");

            try {
              await applicationsService.updateOne(createdId as any, { application_id: applicationUuid, status: "starting" } as Partial<Directus.Applications>);
              scheduleStatusPoll(applicationUuid, applicationsService, createdId as any);
            } catch {}

            // upload env vars best-effort
            try {
              const envFilePath = path.resolve(process.cwd(), "..", "..", "apps", "moca-agent", ".env.staging");
              const envRaw = readFileSync(envFilePath, "utf8");
              const envMap = parseDotEnv(envRaw);
              const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
              if (entries.length > 0) {
                const bulkUrl = `${COOLIFY_API}/applications/${applicationUuid}/envs/bulk`;
                const bulkBody = {
                  data: entries.map(({ key, value }) => ({ key, value, is_preview: false, is_build_time: false, is_literal: true, is_multiline: false, is_shown_once: false })),
                } as Record<string, unknown>;
                await httpJson("PATCH", bulkUrl, bulkBody);
              }
            } catch {}
          } catch (e) {
            try {
              await applicationsService.deleteOne(createdId as any);
            } catch {}
          }
        })();

        const application = await applicationsService.readOne(createdId as any, { fields: [ "id", "status", "url", "application_id", "decc0s", "owner.id" ] as any });
        return res.json({ success: true, created: true, application });
      } catch (error: any) {
        const msg = String(error?.message || "Internal Server Error");
        const code = msg === "Unauthorized" ? 401 : (msg.includes("ethereum_address") ? 400 : 500);
        return res.status(code).json({ success: false, error: msg });
      }
    });

    router.post("/stop", async (req, res) => {
      try {
        const { userId, address } = await getRequester((req as any));
        const schema = await getSchema();
        const { ItemsService } = services;
        const applicationsService = new ItemsService("applications", { schema });

        const existing = await applicationsService.readByQuery({
          filter: { owner: { _eq: userId } },
          limit: 1,
          fields: [ "id", "status", "url", "application_id", "decc0s" ],
        });
        const application = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Applications : undefined;
        if (!application) return res.status(404).json({ success: false, error: "Application not found" });

        const appUuid = String((application as any).application_id || "");
        if (!appUuid) return res.status(400).json({ success: false, error: "Application missing application_id" });

        // verify ownership using first configured token (if present)
        const decc0s = String((application as any).decc0s || "");
        const tokens = decc0s.split(",").map(s => s.trim()).filter(Boolean);
        if (tokens.length > 0) {
          const ok = await verifyOwnership(tokens[0] as string, address);
          if (!ok) return res.status(403).json({ success: false, error: "Ownership not verified" });
        }

        try {
          const stopUrl = `${COOLIFY_API}/applications/${appUuid}/stop`;
          await httpJson("GET", stopUrl);
          await applicationsService.updateOne((application as any).id as any, { status: "offline" } as Partial<Directus.Applications>);
          const updated = await applicationsService.readOne((application as any).id as any, { fields: [ "id", "status", "url", "application_id", "decc0s" ] });
          return res.json({ success: true, stopped: true, application: updated });
        } catch (e: any) {
          return res.status(502).json({ success: false, error: e?.message ?? "Failed to stop application" });
        }
      } catch (error: any) {
        const msg = String(error?.message || "Internal Server Error");
        const code = msg === "Unauthorized" ? 401 : (msg.includes("ethereum_address") ? 400 : 500);
        return res.status(code).json({ success: false, error: msg });
      }
    });

    router.get("/url", async (req, res) => {
      try {
        const { userId, address } = await getRequester((req as any));
        const schema = await getSchema();
        const { ItemsService } = services;
        const applicationsService = new ItemsService("applications", { schema });

        const existing = await applicationsService.readByQuery({
          filter: { owner: { _eq: userId } },
          limit: 1,
          fields: [ "id", "url", "status", "application_id", "decc0s" ],
        });
        const application = Array.isArray((existing as any)) ? (existing as any)[0] as Directus.Applications : undefined;

        if (!application || !application.url) {
          return res.status(404).json({ success: false, error: "Application not found" });
        }

        // verify ownership using first configured token (if present)
        const decc0s = String((application as any).decc0s || "");
        const tokens = decc0s.split(",").map(s => s.trim()).filter(Boolean);
        if (tokens.length > 0) {
          const ok = await verifyOwnership(tokens[0] as string, address);
          if (!ok) return res.status(403).json({ success: false, error: "Ownership not verified" });
        }

        return res.json({ success: true, url: application.url, application });
      } catch (error: any) {
        const msg = String(error?.message || "Internal Server Error");
        const code = msg === "Unauthorized" ? 401 : (msg.includes("ethereum_address") ? 400 : 500);
        return res.status(code).json({ success: false, error: msg });
      }
    });
  },
});
