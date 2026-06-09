#!/usr/bin/env node
/**
 * Produce low-weight derivatives of the room GLBs (rooms are 2.6–20MB each).
 *
 * Downloads each published room model from Directus and runs gltf-transform's
 * `optimize` (Draco geometry compression + WebP textures + dedup/weld/prune).
 * Writes results to ./optimized/ alongside a size report. Re-uploading the
 * derivatives back to Directus (or serving from a CDN) is the follow-up step.
 *
 * Usage:
 *   node scripts/optimize-rooms.mjs                # all rooms
 *   node scripts/optimize-rooms.mjs --limit 5      # first 5 (smoke test)
 *
 * Requires network + the gltf-transform CLI (pulled on demand via npx):
 *   npx --yes @gltf-transform/cli optimize in.glb out.glb \
 *       --compress draco --texture-compress webp
 *
 * The R3F loader already decodes Draco + Meshopt (see Room3DViewer.tsx), so
 * optimized models drop in with no client changes.
 */
import { mkdir, writeFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const DIRECTUS = process.env.DIRECTUS_URL || "https://api.moca.qwellco.de";
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

const mb = (n) => (n / 1048576).toFixed(1) + "MB";

async function main() {
  await mkdir("optimized", { recursive: true });
  const res = await fetch(
    `${DIRECTUS}/items/rooms?fields=id,title,model&filter[model][_nnull]=true&limit=-1`
  );
  const rooms = (await res.json()).data.filter((r) => r.model).slice(0, LIMIT);
  console.log(`Optimizing ${rooms.length} room models…\n`);

  let before = 0;
  let after = 0;
  for (const room of rooms) {
    const url = `${DIRECTUS}/assets/${room.model}`;
    const inPath = `optimized/${room.model}.in.glb`;
    const outPath = `optimized/${room.model}.glb`;
    try {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(inPath, buf);
      await exec("npx", [
        "--yes", "@gltf-transform/cli", "optimize", inPath, outPath,
        "--compress", "draco", "--texture-compress", "webp",
      ]);
      const a = (await stat(inPath)).size;
      const b = (await stat(outPath)).size;
      before += a;
      after += b;
      console.log(`✓ ${room.title.padEnd(28)} ${mb(a)} → ${mb(b)}  (-${Math.round((1 - b / a) * 100)}%)`);
    } catch (err) {
      console.warn(`✗ ${room.title}: ${err.message}`);
    }
  }
  console.log(`\nTotal: ${mb(before)} → ${mb(after)}  (-${Math.round((1 - after / before) * 100)}%)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
