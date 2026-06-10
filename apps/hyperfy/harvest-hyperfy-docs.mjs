#!/usr/bin/env node
/**
 * Feed Hyperfy knowledge to the MOCA Library — so the museum's agents (the
 * docs chat widget, /v1/library/ask consumers, your own integrations) can
 * answer Hyperfy questions and help people spawn exhibitions.
 *
 * Sources the official docs from a hyperfy clone (the repo's docs/ folder is
 * the source of docs.hyperfy.xyz) and ingests every markdown file into a
 * Cortex collection.
 *
 * Usage:
 *   node harvest-hyperfy-docs.mjs \
 *     --hyperfy /path/to/hyperfy \
 *     --cortex https://library.moca.qwellco.de \
 *     --key cortex_rw_…                      # needs a WRITE-capable key
 *     [--collection Hyperfy]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const HYPERFY_DIR = opt("hyperfy", process.env.HYPERFY_DIR);
const CORTEX_URL = (opt("cortex", process.env.CORTEX_API_URL || "")).replace(/\/$/, "");
const CORTEX_KEY = opt("key", process.env.CORTEX_RW_KEY || "");
const COLLECTION = opt("collection", "Hyperfy");

if (!HYPERFY_DIR || !CORTEX_URL || !CORTEX_KEY) {
  console.error("Need --hyperfy <dir>, --cortex <url>, --key <write-capable key>.");
  process.exit(1);
}

const headers = { "X-API-Key": CORTEX_KEY };

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(md|mdx)$/i.test(name)) yield p;
  }
}

// Find (or create) the target collection.
async function collectionId() {
  const res = await fetch(`${CORTEX_URL}/api/collections`, { headers });
  if (!res.ok) throw new Error(`collections list failed (${res.status})`);
  const { collections } = await res.json();
  const hit = collections.find((c) => c.name.toLowerCase() === COLLECTION.toLowerCase());
  if (hit) return hit.id;
  const created = await fetch(`${CORTEX_URL}/api/collections`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: COLLECTION,
      description: "Official Hyperfy documentation (docs.hyperfy.xyz) — worlds, apps, scripting API.",
    }),
  });
  if (!created.ok) throw new Error(`collection create failed (${created.status})`);
  return (await created.json()).id;
}

const docsDir = path.join(path.resolve(HYPERFY_DIR), "docs");
const files = [...walk(docsDir)];
console.log(`Found ${files.length} markdown docs in ${docsDir}`);

const cid = await collectionId();
console.log(`Cortex collection "${COLLECTION}" → ${cid}`);

let ok = 0;
let failed = 0;
for (const f of files) {
  const rel = path.relative(docsDir, f).replace(/[\\/]/g, "__");
  const body = readFileSync(f);
  const form = new FormData();
  form.append("file", new File([body], `hyperfy__${rel}`, { type: "text/markdown" }));
  try {
    const res = await fetch(
      `${CORTEX_URL}/api/upload?start_processing=true&collection_id=${cid}&source=hyperfy-docs`,
      { method: "POST", headers, body: form }
    );
    if (!res.ok) throw new Error(`${res.status}`);
    ok++;
    console.log(`✔ ${rel}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${rel} (${e.message})`);
  }
  await new Promise((r) => setTimeout(r, 1100)); // upload endpoints are 1 rps
}

console.log(`\nDone. Ingested ${ok}/${files.length} docs (${failed} failed).`);
console.log("The Library now knows Hyperfy — scope questions with this collection's id.");
