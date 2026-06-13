/**
 * Chat with the museum guide in your terminal — no Hyperfy world, no running
 * Directus needed. This harness mounts the REAL /v1/guide module
 * (apps/api/extensions/directus-extension-moca/src/v1/guide.ts) against the
 * REAL Cortex Library and the REAL DeCC0s Codex, with only the Directus
 * storage layer mocked in-memory. What answers here is exactly what answers
 * in-world — same context block, same persona (default: DeCC0 #4209,
 * Tsahafi), same suggestion rotation.
 *
 * Usage (from apps/scripts):
 *   bun run guide-chat.ts                          # demo "Echoes of the Mind"
 *   bun run guide-chat.ts my.moca-exhibition.json  # your real export
 *   bun run guide-chat.ts --decc0 777              # another persona
 *
 * Cortex credentials are read from CORTEX_API_URL / CORTEX_API_KEY, falling
 * back to apps/museum/.env (the museum app's read-only key).
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";
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
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const file = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
const DECC0 = Number(opt("decc0", "0")) || undefined; // undefined → server default (4209, Tsahafi)

// ------------------------------------------------- mock Directus layer ----
// Storage only — rooms/nfts enrichment answers empty here (no DB), so the
// context carries whatever the exhibition document itself says. Room
// architect/description enrichment can be tested against a live Directus.
const memoryStore = new Map<string, any>();
const itemsService = async (collection: string) => ({
  readByQuery: async (q: any) => {
    if (collection !== "guide_exhibitions") return [];
    const id = q?.filter?.id?._eq;
    return memoryStore.has(id) ? [memoryStore.get(id)] : [];
  },
  createOne: async (row: any) => memoryStore.set(row.id, row),
  updateOne: async (id: string, row: any) => memoryStore.set(id, { id, ...row }),
});

const errorJson = (res: any, status: number, message: string, code: string) => {
  res.statusCode = status;
  res.body = { errors: [{ message, extensions: { code } }] };
};

// --------------------------------------------------- mount the module ----
const routes: Record<string, (req: any, res: any) => Promise<void>> = {};
const router = {
  post: (p: string, h: any) => (routes[`POST ${p}`] = h),
  get: (p: string, h: any) => (routes[`GET ${p}`] = h),
};
const cortex = createCortexClient(env);
const decc0s = createDecc0sClient(env);
const souls = createSoulsClient(env);
registerGuideRoutes(router, { itemsService, cortex, decc0s, souls, errorJson });

async function call(key: string, { body, params, query }: any = {}) {
  const req = { body: body || {}, params: params || {}, query: query || {}, headers: {}, ip: "local" };
  const res: any = {
    statusCode: 200,
    set() {},
    json(b: any) {
      this.body = b;
    },
    status(c: number) {
      this.statusCode = c;
      return this;
    },
  };
  await routes[key](req, res);
  return res;
}

// ------------------------------------------------------- the exhibition ----
const demo = {
  format: "moca-exhibition@1",
  id: "echoes-of-the-mind",
  name: "Echoes of the Mind",
  placements: [
    {
      uid: "p0",
      room: { id: 1, title: "Echo Chamber" },
      artworks: [
        { name: "Right Click and Save As Guy", artist: "XCOPY" },
        { name: "Genesis", artist: "Hackatao" },
      ],
    },
  ],
};
const exhibition = file ? JSON.parse(readFileSync(file, "utf8")) : demo;

console.log(`\nCortex: ${env.CORTEX_API_URL || "NOT CONFIGURED"} ${cortex.configured ? "(configured)" : "(missing key — answers will be offline fallbacks)"}`);
console.log(`Exhibition: "${exhibition.name}" (${exhibition.placements.length} room(s))${file ? ` from ${file}` : " — built-in demo"}`);

const reg = await call("POST /guide/exhibitions", {
  body: {
    format: exhibition.format,
    id: exhibition.id || (exhibition.name || "exhibition").replace(/[^\w.:-]+/g, "-").toLowerCase(),
    name: exhibition.name,
    generator: exhibition.generator,
    placements: exhibition.placements.map((p: any) => ({
      uid: p.uid,
      room: { id: p.room?.id, title: p.room?.title },
      artworks: (p.artworks || []).map((a: any) => ({ id: a.id, name: a.name, artist: a.artist })),
    })),
  },
});
if (reg.statusCode !== 200) {
  console.error("Registration failed:", JSON.stringify(reg.body));
  process.exit(1);
}
const exhibitionId = reg.body.data.id;
console.log(
  `Registered: ${JSON.stringify(reg.body.data.counts)} — artists: ${reg.body.data.artists.join(", ") || "(from document)"}\n`,
);
console.log("Suggested questions:");
for (const [i, s] of reg.body.data.suggestions.entries()) console.log(`  ${i + 1}. ${s}`);
console.log('\nType a question (or 1-3 for a suggestion, "exit" to quit). First answer loads the persona — give it a few seconds.\n');

// ----------------------------------------------------------- chat loop ----
const history: { role: string; content: string }[] = [];
let suggestions: string[] = reg.body.data.suggestions;
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let stdinClosed = false;
rl.on("close", () => {
  stdinClosed = true;
});
const promptUser = () =>
  stdinClosed
    ? Promise.resolve("exit")
    : new Promise<string>((resolve) => {
        rl.question("you › ", resolve);
        rl.once("close", () => resolve("exit"));
      });

for (;;) {
  const line = (await promptUser()).trim();
  if (!line || line === "exit" || line === "quit") break;
  const question = /^[1-9]$/.test(line) && suggestions[Number(line) - 1] ? suggestions[Number(line) - 1] : line;
  if (question !== line) console.log(`      (${question})`);

  const t0 = Date.now();
  const res = await call("POST /guide/ask", {
    body: { exhibition: exhibitionId, question, history: history.slice(-8), decc0: DECC0, visitor: "curator" },
  });
  if (res.statusCode !== 200) {
    console.error("✗", JSON.stringify(res.body));
    continue;
  }
  const d = res.body.data;
  console.log(`\n${d.persona}${d.fallback ? " (offline fallback)" : ""} › ${d.answer}\n`);
  if (d.sources?.length) console.log(`  sources: ${d.sources.join(" · ")}`);
  if (d.suggestions?.length) {
    suggestions = d.suggestions;
    console.log(`  next: ${d.suggestions.map((s: string, i: number) => `[${i + 1}] ${s}`).join("  ")}`);
  }
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)}s)\n`);
  history.push({ role: "user", content: question });
  history.push({ role: "assistant", content: d.answer });
}
rl.close();
