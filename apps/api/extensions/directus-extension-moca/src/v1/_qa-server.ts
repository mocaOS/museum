/**
 * QA-only standalone harness — mounts the REAL guide routes (registerGuideRoutes)
 * on a plain Express server so we can exercise the in-world guide end-to-end
 * (live Venice/Cortex/MuseumAgent + Redis) WITHOUT booting Directus. Not shipped;
 * delete after testing. Run: bun src/v1/_qa-server.ts
 *
 * itemsService is stubbed (no DB) — loadContext/enrich fall back to the in-memory
 * store + the registration payload's own room/artwork data, which is all the
 * guide needs to answer. Redis is pointed at the local no-auth instance.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import express from "express";
import { registerGuideRoutes } from "./guide";
import { createCortexClient } from "./cortex";
import { createDecc0sClient } from "./decc0s";
import { createSoulsClient } from "./souls";
import { createVeniceClient } from "./venice";
import { createMuseumAgentClient } from "./museum-agent";

// Load apps/api/.env (this file lives at apps/api/extensions/directus-extension-moca/src/v1).
const envPath = path.resolve(import.meta.dir, "../../../../.env");
const env: Record<string, any> = { ...process.env };
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
// Local QA Redis (no-auth) — the .env REDIS carries prod creds that 401 here.
env.REDIS_ENABLED = "true";
env.REDIS = "redis://127.0.0.1:6379";
// Trace the guide's Cortex calls (mine/starters/pre-warm) in the harness log.
env.GUIDE_DEBUG_CORTEX = "true";

const app = express();
// Permissive CORS — the in-world guide's audio fetch + the builder's browser-side
// registration are cross-origin (world on :3400 / builder on :3331 → harness on
// :8055). Real Directus has CORS_ENABLED; this bare harness must too, or the
// browser blocks the TTS audio load and the spawn-time registration POST.
app.use((req, res, next) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "1mb" }));
app.use((req, _res, next) => { console.log(`[qa] ${req.method} ${req.url}`); next(); });

const itemsService = async (_collection: string) => ({
  readByQuery: async () => [],
  readOne: async () => null,
  createOne: async () => ({}),
  updateOne: async () => ({}),
});
const errorJson = (res: any, status: number, message: string, code: string) =>
  res.status(status).json({ errors: [{ message, extensions: { code } }] });

const router = express.Router();
registerGuideRoutes(router, {
  itemsService: itemsService as any,
  cortex: createCortexClient(env),
  decc0s: createDecc0sClient(env),
  souls: createSoulsClient(env),
  venice: createVeniceClient(env),
  museumAgent: createMuseumAgentClient(env),
  publicUrl: "", // relative audioUrl → the in-world client resolves it against its API base
  env,
  errorJson,
});
app.use("/v1", router);
app.get("/server/health", (_req, res) => res.json({ status: "ok" }));

const PORT = 8055;
app.listen(PORT, "0.0.0.0", () => console.log(`[qa] guide API on http://0.0.0.0:${PORT} (real routes, no Directus)`));
