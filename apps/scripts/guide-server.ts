/**
 * Standalone museum-guide API server — the four /v1/guide/* routes from the
 * REAL extension module (apps/api/.../src/v1/guide.ts), served over plain
 * HTTP with the storage layer in memory. For local trials of the in-world
 * guide before the Directus extension is deployed: point the guide app's
 * "Museum API" at this server and the full Cortex + DeCC0/Soulweaver persona
 * stack answers.
 *
 *   bun run guide-server.ts [--port 8787]
 *
 * Cortex credentials come from CORTEX_API_URL / CORTEX_API_KEY, falling back
 * to apps/museum/.env. CORS is wide open (it mimics the public endpoints).
 * Registrations live in memory — they vanish on restart; just re-send the
 * guide (or re-register) after.
 */

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { createCortexClient } from "../api/extensions/directus-extension-moca/src/v1/cortex";
import { createDecc0sClient } from "../api/extensions/directus-extension-moca/src/v1/decc0s";
import { registerGuideRoutes } from "../api/extensions/directus-extension-moca/src/v1/guide";
import { createSoulsClient } from "../api/extensions/directus-extension-moca/src/v1/souls";

// ---------------------------------------------------------------- env ----
const env: Record<string, string> = { ...process.env } as Record<string, string>;
if (!env.CORTEX_API_URL || !env.CORTEX_API_KEY) {
  const museumEnv = path.resolve(import.meta.dir, "../museum/.env");
  if (existsSync(museumEnv)) {
    for (const line of readFileSync(museumEnv, "utf8").split("\n")) {
      const m = line.match(/^(CORTEX_API_URL|CORTEX_API_KEY)=["']?([^"'\n]+)["']?\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
}

const args = process.argv.slice(2);
const portFlag = args.indexOf("--port");
const PORT = portFlag >= 0 ? Number(args[portFlag + 1]) : 8787;

// ------------------------------------------------- in-memory Directus ----
const store = new Map<string, any>();
const itemsService = async (collection: string) => ({
  readByQuery: async (q: any) => {
    if (collection !== "guide_exhibitions") return [];
    const id = q?.filter?.id?._eq;
    return store.has(id) ? [store.get(id)] : [];
  },
  createOne: async (row: any) => store.set(row.id, row),
  updateOne: async (id: string, row: any) => store.set(id, { id, ...row }),
});

const errorJson = (res: any, status: number, message: string, code: string) => {
  res.statusCode = status;
  res.body = { errors: [{ message, extensions: { code } }] };
};

// ------------------------------------------------- route registration ----
type Handler = (req: any, res: any) => Promise<void> | void;
const routes: { method: string; pattern: string; handler: Handler }[] = [];
const router = {
  post: (p: string, h: Handler) => routes.push({ method: "POST", pattern: p, handler: h }),
  get: (p: string, h: Handler) => routes.push({ method: "GET", pattern: p, handler: h }),
};

const cortex = createCortexClient(env);
const decc0s = createDecc0sClient(env);
const souls = createSoulsClient(env);
registerGuideRoutes(router, { itemsService, cortex, decc0s, souls, errorJson });

/** Express-style pattern match: "/guide/exhibitions/:id" → params. */
function match(pattern: string, pathname: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const u = pathname.split("/").filter(Boolean);
  if (p.length !== u.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(u[i]);
    else if (p[i] !== u[i]) return null;
  }
  return params;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  // The extension mounts under /v1; accept both /v1/guide/* and /guide/*.
  const pathname = url.pathname.replace(/^\/v1/, "");

  let body: any = {};
  if (req.method === "POST") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    } catch {
      body = {};
    }
  }

  for (const route of routes) {
    if (route.method !== req.method) continue;
    const params = match(route.pattern, pathname);
    if (!params) continue;
    const mockReq = {
      body,
      params,
      query: Object.fromEntries(url.searchParams),
      headers: req.headers,
      ip: req.socket.remoteAddress,
    };
    const mockRes: any = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      set(k: string, v: string) {
        this.headers[k] = v;
      },
      status(c: number) {
        this.statusCode = c;
        return this;
      },
      json(b: any) {
        this.body = b;
      },
    };
    try {
      await route.handler(mockReq, mockRes);
    } catch (err) {
      mockRes.statusCode = 500;
      mockRes.body = { errors: [{ message: String(err), extensions: { code: "INTERNAL" } }] };
    }
    res.writeHead(mockRes.statusCode, {
      "Content-Type": "application/json",
      ...CORS,
      ...mockRes.headers,
    });
    console.log(`${req.method} ${url.pathname} → ${mockRes.statusCode}`);
    return res.end(JSON.stringify(mockRes.body ?? {}));
  }

  res.writeHead(404, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify({ errors: [{ message: "Unknown route", extensions: { code: "NOT_FOUND" } }] }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Museum guide API on http://0.0.0.0:${PORT}  (routes: /v1/guide/*)`);
  console.log(`Cortex: ${env.CORTEX_API_URL || "NOT CONFIGURED"} ${cortex.configured ? "(configured)" : "(missing key — offline fallbacks)"}`);
  console.log("Registrations are in-memory — re-send the guide after a restart.");
});
