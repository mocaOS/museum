import { json as expressJson } from "express";
import { defineEndpoint } from "@directus/extensions-sdk";
import type { Directus } from "@local/types";

export default defineEndpoint({
  id: "applications",

  handler: (router, { services, getSchema, env }) => {
    // Ensure JSON bodies are parsed for this endpoint
    router.use(expressJson());

    // Store logs for each application
    const applicationLogs = new Map<number, string[]>();

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
      const graphqlEndpoint = "https://api.studio.thegraph.com/query/1095/decc-0-s/version/latest";
      const query = "query GetTokenByIdAndOwner($tokenId: String!, $owner: String!) { tokens(where: { tokenId: $tokenId, owner: $owner }) { tokenId owner id } }";
      const body = JSON.stringify({ query, variables: { tokenId, owner: ownerAddress } });
      const response = await fetch(graphqlEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": "Bearer f594925caf0ceeb766c3ee890d478808",
        },
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

          // Check if there's an ongoing deployment for this application and get its logs
          let isDeploying = false;
          try {
            const deployments = await httpJson("GET", `${COOLIFY_API}/deployments`) as any[] | undefined;
            if (Array.isArray(deployments)) {
              // Find the deployment for this application
              const deployment = deployments.find((d: any) => {
                const deploymentUrl = String(d?.deployment_url || "");
                return deploymentUrl.includes(applicationUuid);
              });

              if (deployment) {
                isDeploying = true;

                // Get logs directly from the deployment object
                const deploymentLogs = JSON.parse(deployment.logs);

                if (Array.isArray(deploymentLogs)) {
                  // Clear existing logs for this application
                  applicationLogs.set(applicationId, []);

                  // Add each log entry from the deployment
                  for (const logEntry of deploymentLogs) {
                    if (logEntry && typeof logEntry === "object") {
                      const message = String(logEntry?.message || logEntry?.line || logEntry?.output || "");
                      if (message) {
                        const logLine = message;
                        const logs = applicationLogs.get(applicationId) || [];
                        logs.push(logLine);
                        applicationLogs.set(applicationId, logs);
                      }
                    }
                  }

                  const logs = applicationLogs.get(applicationId) || [];

                  if (logs.length > 100) {
                    applicationLogs.set(applicationId, logs.slice(-50));
                  }
                }
              }
            }
          } catch (e: any) {
            // Ignore deployment check errors
          }

          if (isDeploying) {
            // Keep status as "starting" while deployment is in progress
            await applicationsService.updateOne(applicationId as any, { status: "starting" } as Partial<Directus.Applications>);
          } else if (status.includes("running")) {
            await applicationsService.updateOne(applicationId as any, { status: "online" } as Partial<Directus.Applications>);
            clearInterval(interval);
          }
        } catch (e: any) {
          // Ignore errors
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

    async function getApplicationEnvFromDirectus(schema: any): Promise<Record<string, string>> {
      try {
        const { ItemsService } = services;
        const settingsService = new ItemsService("settings", { schema });

        const setting = await settingsService.readByQuery({
          filter: { key: { _eq: "application_env" } },
          limit: 1,
          fields: [ "key", "value" ],
        });

        const settingItem = Array.isArray(setting) ? setting[0] as Directus.Settings : undefined;

        if (!settingItem?.value || typeof settingItem.value !== "string") {
          throw new Error("application_env setting not found or invalid");
        }

        return parseDotEnv(settingItem.value);
      } catch (error: any) {
        console.error("Error fetching application_env from Directus:", error?.message);
        return {};
      }
    }

    async function deleteAllCoolifyEnvVars(applicationUuid: string): Promise<void> {
      try {
        // Get all existing environment variables
        const envVars = await httpJson("GET", `${COOLIFY_API}/applications/${applicationUuid}/envs`) as any[] | undefined;

        if (!Array.isArray(envVars) || envVars.length === 0) {
          return;
        }

        // Delete each environment variable
        for (const envVar of envVars) {
          const envId = envVar?.id || envVar?.uuid;
          if (envId) {
            try {
              await httpJson("DELETE", `${COOLIFY_API}/applications/${applicationUuid}/envs/${envId}`);
            } catch (error: any) {
              console.error(`Failed to delete env var ${envId}:`, error?.message);
            }
          }
        }
      } catch (error: any) {
        console.error("Error deleting Coolify environment variables:", error?.message);
      }
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
        const INSTALL_COMMAND = "/usr/local/bin/bun install --frozen-lockfile";
        const BUILD_COMMAND = "#";
        const START_COMMAND = `cd /app/apps/moca-agent && APP_ENV=staging /usr/local/bin/bun run generate-characters.ts ${address} && /usr/local/bin/bun run start`;
        const EXPOSE_PORT = 3005;
        const BUILD_PACK = "nixpacks";
        const GIT_REPOSITORY = "https://github.com/mocaOS/museum.git";
        const GIT_BRANCH = "staging";
        const DOMAIN_SUFFIX = "deploy.qwellco.de";
        const baseName = "moca-agent";

        if (existingApp && (existingApp as any).application_id) {
          // update selection, update app configuration, and start existing app
          const applicationUuid = String((existingApp as any).application_id);

          try {
            let hasConfigChanges = false;
            let hasEnvChanges = false;

            // Check if configuration has changed
            try {
              const currentApp = await httpJson("GET", `${COOLIFY_API}/applications/${applicationUuid}`) as any;

              if (
                currentApp?.git_branch !== GIT_BRANCH
                || currentApp?.install_command !== INSTALL_COMMAND
                || currentApp?.build_command !== BUILD_COMMAND
                || currentApp?.start_command !== START_COMMAND
                || String(currentApp?.ports_exposes || "") !== String(EXPOSE_PORT)
              ) {
                hasConfigChanges = true;
              }
            } catch (e: any) {
              // If we can't fetch current config, assume changes exist
              hasConfigChanges = true;
            }

            // Check if environment variables have changed
            try {
              const schema = await getSchema();
              const desiredEnvMap = await getApplicationEnvFromDirectus(schema);
              // Extend with CENTRAL_MESSAGE_SERVER_URL
              desiredEnvMap.CENTRAL_MESSAGE_SERVER_URL = (existingApp as any).url || "";

              const currentEnvVars = await httpJson("GET", `${COOLIFY_API}/applications/${applicationUuid}/envs`) as any[] | undefined;
              const currentEnvMap: Record<string, string> = {};

              if (Array.isArray(currentEnvVars)) {
                for (const envVar of currentEnvVars) {
                  if (envVar?.key && envVar?.value !== undefined) {
                    currentEnvMap[envVar.key] = String(envVar.value);
                  }
                }
              }

              // Compare env vars
              const desiredKeys = Object.keys(desiredEnvMap).sort();
              const currentKeys = Object.keys(currentEnvMap).sort();

              if (desiredKeys.length !== currentKeys.length || desiredKeys.some((k, i) => k !== currentKeys[i])) {
                hasEnvChanges = true;
              } else {
                for (const key of desiredKeys) {
                  if (desiredEnvMap[key] !== currentEnvMap[key]) {
                    hasEnvChanges = true;
                    break;
                  }
                }
              }
            } catch (e: any) {
              // If we can't fetch current env vars, assume changes exist
              hasEnvChanges = true;
            }

            // Update configuration if changes detected
            if (hasConfigChanges) {
              try {
                const updateUrl = `${COOLIFY_API}/applications/${applicationUuid}`;
                const updatePayload: Record<string, unknown> = {
                  git_branch: GIT_BRANCH,
                  install_command: INSTALL_COMMAND,
                  build_command: BUILD_COMMAND,
                  start_command: START_COMMAND,
                  ports_exposes: String(EXPOSE_PORT),
                };
                await httpJson("PATCH", updateUrl, updatePayload);
              } catch {}
            }

            // Update env vars if changes detected
            if (hasEnvChanges) {
              try {
                const schema = await getSchema();
                const envMap = await getApplicationEnvFromDirectus(schema);
                // Extend with CENTRAL_MESSAGE_SERVER_URL
                envMap.CENTRAL_MESSAGE_SERVER_URL = (existingApp as any).url || "";
                const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
                if (entries.length > 0) {
                  // Delete all existing environment variables first
                  await deleteAllCoolifyEnvVars(applicationUuid);

                  // Add new environment variables
                  const bulkUrl = `${COOLIFY_API}/applications/${applicationUuid}/envs/bulk`;
                  const bulkBody = {
                    data: entries.map(({ key, value }) => ({ key, value, is_preview: false, is_build_time: false, is_literal: true, is_multiline: false, is_shown_once: false })),
                  } as Record<string, unknown>;
                  await httpJson("PATCH", bulkUrl, bulkBody);
                }
              } catch {}
            }

            // Update decc0s token selection regardless
            await applicationsService.updateOne((existingApp as any).id as any, { decc0s: tokenIds.join(",") } as Partial<Directus.Applications>);

            // Use restart if no changes, otherwise use start
            let actionUrl: string;
            let actionType: string;

            if (!hasConfigChanges && !hasEnvChanges) {
              // No changes detected, just restart
              actionUrl = `${COOLIFY_API}/applications/${applicationUuid}/restart`;
              actionType = "restarted";
            } else {
              // Changes detected, do full start with deployment
              actionUrl = `${COOLIFY_API}/applications/${applicationUuid}/start?instant_deploy=true&force=true`;
              actionType = "started";
            }

            await httpJson("GET", actionUrl);
            await applicationsService.updateOne((existingApp as any).id as any, { status: "starting" } as Partial<Directus.Applications>);
            scheduleStatusPoll(applicationUuid, applicationsService, (existingApp as any).id as any);
            const updated = await applicationsService.readOne((existingApp as any).id as any, { fields: [ "id", "status", "url", "application_id", "decc0s", "owner.id" ] as any });
            return res.json({ success: true, created: false, started: true, action: actionType, hasConfigChanges, hasEnvChanges, application: updated });
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
              const schema = await getSchema();
              const envMap = await getApplicationEnvFromDirectus(schema);
              // Extend with CENTRAL_MESSAGE_SERVER_URL
              envMap.CENTRAL_MESSAGE_SERVER_URL = domainUrl;
              const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
              if (entries.length > 0) {
                // Delete all existing environment variables first (in case any were created during setup)
                await deleteAllCoolifyEnvVars(applicationUuid);

                // Add new environment variables
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

        // Display a random loading message during deployment
        let info = "";
        const applicationId = (application as any).id;

        if (applicationLogs.has(applicationId)) {
          const logs = applicationLogs.get(applicationId)!;

          if (logs.length > 0) {
            // Array of loading messages to display randomly
            const loadingMessages = [
              "Waking up your Decc0 agent...",
              "Teaching your agent to chat",
              "Loading personality modules",
              "Syncing with the museum network",
              "Building agent intelligence",
              "Brewing some digital consciousness",
              "Configuring agent memory banks",
              "Connecting neural pathways",
              "Unpacking character traits",
              "Initializing conversation engine",
              "Setting up agent workspace",
              "Loading crypto art knowledge",
              "Calibrating agent responses",
              "Deploying to Coolify servers",
              "Your Decc0 is getting ready to talk!",
              "Installing agent personality",
              "Preparing AI modules",
              "Agent is learning your style",
              "Almost ready to chat!",
              "Finalizing your elizaOS instance",
            ];

            // Pick a random loading message
            info = loadingMessages[Math.floor(Math.random() * loadingMessages.length)] || "Preparing your agent...";
          }
        }

        return res.json({ success: true, url: application.url, application, info });
      } catch (error: any) {
        const msg = String(error?.message || "Internal Server Error");
        const code = msg === "Unauthorized" ? 401 : (msg.includes("ethereum_address") ? 400 : 500);
        return res.status(code).json({ success: false, error: msg });
      }
    });
  },
});
