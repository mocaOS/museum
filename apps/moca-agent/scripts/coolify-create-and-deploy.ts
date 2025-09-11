/*
  Create & deploy a Coolify application for moca-agent.

  Usage (from repo root or app dir with Bun):
    bun apps/moca-agent/scripts/coolify-create-and-deploy.ts

  Requirements:
  - Coolify API token and IDs provided in this script (can be refactored to env/CLI if needed)
  - Will read env vars from apps/moca-agent/.env.staging and attempt to upload to Coolify

  Docs:
  - Authorization: https://coolify.io/docs/api-reference/authorization
  - Create Public Application: https://coolify.io/docs/api-reference/api/operations/create-public-application
  - Deploy by Tag or UUID: https://coolify.io/docs/api-reference/api/operations/deploy-by-tag-or-uuid
  - Get Project by UUID: https://coolify.io/docs/api-reference/api/operations/get-project-by-uuid
  - Get Environment by Name or UUID: https://coolify.io/docs/api-reference/api/operations/get-environment-by-name-or-uuid
  - Get Server by UUID: https://coolify.io/docs/api-reference/api/operations/get-server-by-uuid
*/

import { readFileSync } from "node:fs";
import path from "node:path";

// Use Node/Bun native fetch

type JsonRecord = Record<string, unknown>;

// Static configuration from user request
const COOLIFY_BASE_URL = "https://deploy.qwellco.de"; // no trailing slash
const COOLIFY_API = `${COOLIFY_BASE_URL}/api/v1`;
const COOLIFY_TOKEN = env.COOLIFY_TOKEN;
const PROJECT_UUID = "aww04oc";
const SERVER_UUID = "zgcgcw0";
const ENVIRONMENT_UUID = "igkwgkcs4g84ksgs048w08kg";

// Build configuration from user request
const INSTALL_COMMAND = "/usr/local/bin/bun install --frozen-lockfile";
const BUILD_COMMAND
  = "/usr/local/bin/bun run build --filter=@local/config --filter=moca-agent";
const START_COMMAND = "cd /app/apps/moca-agent && /usr/local/bin/bun run start";
const EXPOSE_PORT = 3005;
const BUILD_PACK = "nixpacks";

function generateRandomSubdomain(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${rand}`.toLowerCase();
}

function safeJson<T = unknown>(data: unknown): T | undefined {
  try {
    return data as T;
  } catch {
    return undefined;
  }
}

async function httpJson(method: string, url: string, body?: JsonRecord | string) {
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
    return text;
  }
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

async function main() {
  const gitRepo = "https://github.com/mocaOS/museum.git";
  const gitBranch = "staging";
  const baseName = "moca-agent";
  const subdomain = generateRandomSubdomain(baseName);
  const appName = subdomain; // use generated subdomain as application name
  const domainHost = `https://${subdomain}.deploy.qwellco.de`;

  // Validate inputs via API (best-effort)
  try {
    await Promise.all([
      httpJson("GET", `${COOLIFY_API}/projects/${PROJECT_UUID}`),
      httpJson("GET", `${COOLIFY_API}/servers/${SERVER_UUID}`),
      httpJson("GET", `${COOLIFY_API}/environments/${ENVIRONMENT_UUID}`),
    ]);
  } catch (e) {
    console.warn("Warning: One of the validation requests failed. Proceeding anyway.\n", e instanceof Error ? e.message : e);
  }

  // Create application (Public repo)
  const createPayload: JsonRecord = {
    project_uuid: PROJECT_UUID,
    server_uuid: SERVER_UUID,
    environment_uuid: ENVIRONMENT_UUID,
    git_repository: gitRepo,
    git_branch: gitBranch,
    build_pack: BUILD_PACK,
    ports_exposes: String(EXPOSE_PORT),
    name: appName,
    // Domain should be host only; Coolify will handle scheme
    domains: domainHost,
    // Commands
    install_command: INSTALL_COMMAND,
    build_command: BUILD_COMMAND,
    start_command: START_COMMAND,
    // Flags
    instant_deploy: true,
    // Attempt to force non-www redirect; field name per docs is "redirect"
    redirect: "non-www",
    // Build from monorepo root
    base_directory: "/",
    publish_directory: "/",
  };

  console.log("Creating application on Coolify...", { name: appName, gitRepo, gitBranch, domain: domainHost });
  const created = safeJson<{ uuid: string }>(await httpJson("POST", `${COOLIFY_API}/applications/public`, createPayload));

  if (!created || !created.uuid) {
    console.error("Failed to create application: no UUID returned.");
    process.exit(1);
  }

  const applicationUuid = created.uuid;
  console.log(`Application created. UUID: ${applicationUuid}`);

  // Try to upload environment variables from apps/moca-agent/.env.staging
  try {
    const envFilePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", ".env.staging");
    const envRaw = readFileSync(envFilePath, "utf8");
    const envMap = parseDotEnv(envRaw);

    const entries = Object.entries(envMap).map(([ key, value ]) => ({ key, value }));
    if (entries.length > 0) {
      // Bulk update via documented endpoint
      // https://coolify.io/docs/api-reference/api/operations/update-envs-by-application-uuid
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
      } as JsonRecord;
      await httpJson("PATCH", bulkUrl, bulkBody);
      console.log(`Uploaded ${entries.length} environment variables from .env.staging.`);
    } else {
      console.log("No environment variables found in .env.staging to upload.");
    }
  } catch (e) {
    console.warn("Warning: Failed to upload env vars to Coolify. You may need to set them manually.");
    console.warn(e instanceof Error ? e.message : e);
  }

  console.log("Done.");
  console.log("Domain:", `https://${domainHost}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
