#!/usr/bin/env node
/**
 * Spawn a MOCA exhibition into a Hyperfy v2 world.
 *
 * Takes the `*.moca-exhibition.json` file exported from the museum's world
 * builder (museumofcryptoart.com/rooms/world → Export) and recreates it inside
 * a running world. All it needs is the world's base URL and its admin key
 * (the world's ADMIN_CODE):
 *
 *   node spawn-exhibition.mjs my-show.moca-exhibition.json \
 *     --url https://world.example.com --key YOUR_ADMIN_CODE
 *
 * No Hyperfy checkout required — `npm install` in this folder is the whole
 * setup. The spawner speaks the engine's wire protocol directly
 * (lib/protocol.mjs, pinned to Hyperfy v0.16.0).
 *
 * MODULAR & IDEMPOTENT. Every placed room becomes its own Hyperfy app whose
 * generated script (lib/room-script.mjs) hangs the curated artworks onto the
 * room GLB's Slot_NNN nodes — the works are child nodes, so they stay
 * attached to their room forever, including when admins rearrange rooms
 * in-world. Blueprint/entity ids derive deterministically from the
 * exhibition id + placement uid, so re-running the spawner UPDATES the same
 * rooms (curation changes flow in; the room positions admins refined
 * in-engine are preserved). Use --relayout to force museum room positions
 * back onto existing rooms, or --fresh to spawn an independent copy.
 *
 * LAYOUT TRANSLATION. The museum builder normalizes every room onto an
 * 8-unit tile (scaled to fit, centered, floor at y=0) — placement positions
 * live in that tile space, while Hyperfy renders GLBs at native size and
 * pivot. Exports therefore carry each room's raw measurements (`footprint`,
 * `groundOffset`); the spawner reproduces the builder's exact layout by
 * scaling each room to --tile-size meters per tile and converting positions
 * accordingly. Older exports without measurements spawn at native scale with
 * a warning.
 *
 * Options:
 *   --url <https://world>     world base url (ws/api derived)        [required]
 *   --key <code>              the world's admin key / ADMIN_CODE
 *   --tile-size <m>           meters one builder tile maps to (default 16) —
 *                             room size and spacing scale together
 *   --art-size <m>            base artwork size in meters (default 2; also the
 *                             in-world inspector default per room)
 *   --unpinned                spawn rooms unpinned (grabbable by any builder)
 *   --relayout                move existing rooms back to the museum layout
 *   --fresh                   ignore previous spawns; create new copies
 *   --no-verify               skip the post-spawn verification pass
 *   --name <bot name>         spawner's display name in the world
 *
 * Privacy by design: the exhibition file lives on the curator's device. This
 * command is the explicit "upload it into Hyperfy" moment — nothing reaches a
 * world until the curator runs it (or uses the builder's Spawn dialog).
 */

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import {
  deterministicUuid,
  HyperfySession,
  uploadAsset,
  yawToQuaternion,
} from "./lib/protocol.mjs";
import { generateRoomScript } from "./lib/room-script.mjs";

// ---------------------------------------------------------------- args ----
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

if (!file) {
  console.error("Usage: node spawn-exhibition.mjs <exhibition.json> --url <https://world> --key <admin code>");
  process.exit(1);
}

const BASE_URL = (opt("url", process.env.HYPERFY_WORLD_URL || "http://localhost:3000")).replace(/\/+$/, "");
const KEY = opt("key", opt("admin-code", process.env.HYPERFY_ADMIN_CODE || ""));
// The builder lays rooms out on 8-unit tiles; one tile maps to this many meters.
const BUILDER_TILE = 8;
const TILE_METERS = Number(
  opt("tile-size", opt("unit-scale", null) ? String(BUILDER_TILE * Number(opt("unit-scale", "1"))) : "16"),
);
const ART_SIZE = Number(opt("art-size", "2"));
const BOT_NAME = opt("name", "MOCA Exhibition Spawner");
const UNPINNED = flag("unpinned");
const RELAYOUT = flag("relayout");
const FRESH = flag("fresh");
const VERIFY = !flag("no-verify");

if (opt("hyperfy", null)) {
  console.log("Note: --hyperfy is no longer needed — the spawner speaks the wire protocol itself.\n");
}

const exhibition = JSON.parse(readFileSync(file, "utf8"));
if (exhibition.format !== "moca-exhibition@1") {
  console.error(`Unsupported format: ${exhibition.format}`);
  process.exit(1);
}

// Stable identity for idempotent re-spawns: exports carry an `id` since the
// builder started persisting one per exhibition; older files fall back to the
// name, and --fresh forces a brand-new identity.
const exhibitionKey = FRESH
  ? crypto.randomUUID()
  : exhibition.id || exhibition.name || "default";

// ---------------------------------------------------------------- main ----
console.log(`Exhibition: "${exhibition.name}" — ${exhibition.placements.length} room(s)`);
console.log(`World: ${BASE_URL}\n`);

const session = await HyperfySession.connect({ url: BASE_URL, name: BOT_NAME });

if (session.hasAdminCode) {
  if (!KEY) {
    console.error("This world requires an admin key (--key). Ask the world's operator for its ADMIN_CODE.");
    session.close();
    process.exit(1);
  }
  await session.grantAdmin(KEY);
  console.log("Claimed builder rights with the admin key.");
} else {
  console.log("World has no admin code set — building rights are open.");
}

const stats = { created: 0, updated: 0, unchanged: 0, failed: 0, artworks: 0 };
const expected = []; // [{bpId, enId, title}] for the verification pass

for (const placement of exhibition.placements) {
  const title = placement.room.title;
  console.log(`\n→ ${title} (${placement.artworks.length} works)`);
  try {
    const bpId = await deterministicUuid(`${exhibitionKey}:${placement.uid}:blueprint`);
    const enId = await deterministicUuid(`${exhibitionKey}:${placement.uid}:entity`);

    // Reproduce the builder's tile normalization: scale the room so its
    // footprint spans one tile (TILE_METERS), recenter it on the tile with
    // the floor at y=0, and convert tile-space positions to meters.
    const k = TILE_METERS / BUILDER_TILE; // meters per builder unit
    const rotY = placement.rotationY || 0;
    const fp = placement.room.footprint;
    const go = placement.room.groundOffset;
    let rootScale = 1;
    let position;
    if (fp > 0 && Array.isArray(go)) {
      rootScale = TILE_METERS / fp;
      const ox = rootScale * go[0];
      const oy = rootScale * go[1];
      const oz = rootScale * go[2];
      const cos = Math.cos(rotY);
      const sin = Math.sin(rotY);
      position = [
        k * placement.position[0] + ox * cos + oz * sin,
        k * (placement.position[1] || 0) + oy,
        k * placement.position[2] - ox * sin + oz * cos,
      ];
    } else {
      console.warn("  (old export without room measurements — spawning at native model scale)");
      position = [
        k * placement.position[0],
        placement.position[1] || 0,
        k * placement.position[2],
      ];
    }
    const quaternion = yawToQuaternion(rotY);
    const scaleArr = [rootScale, rootScale, rootScale];

    // 1. Room model (content-addressed; re-uploads are no-ops)
    const glbRes = await fetch(placement.room.modelUrl);
    if (!glbRes.ok) throw new Error(`room model unreachable (${glbRes.status})`);
    const glb = Buffer.from(await glbRes.arrayBuffer());
    const modelUrl = await uploadAsset({ baseUrl: BASE_URL, bytes: glb, ext: "glb", mime: "model/gltf-binary" });
    console.log(`  model ${modelUrl} (${(glb.length / 1e6).toFixed(1)} MB)`);

    // 2. Curated images become world assets — the exhibition lives in the
    //    world itself, not as hotlinks to museum infrastructure. Videos stay
    //    remote (they can be huge and stream fine). Failures fall back to
    //    the original URL so one dead image never blocks a room.
    let uploadedArt = 0;
    const artworks = [];
    for (const art of placement.artworks) {
      let imageUrl = art.imageUrl;
      if (imageUrl && !imageUrl.startsWith("asset://")) {
        try {
          const res = await fetch(imageUrl);
          if (res.ok) {
            const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
            const ext = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" }[mime] || "jpg";
            imageUrl = await uploadAsset({
              baseUrl: BASE_URL,
              bytes: Buffer.from(await res.arrayBuffer()),
              ext,
              mime,
            });
            uploadedArt++;
          }
        } catch {
          /* keep the remote URL */
        }
      }
      artworks.push({ ...art, imageUrl });
    }
    if (uploadedArt) console.log(`  ${uploadedArt} artwork image(s) uploaded into the world`);

    // 3. Per-room curation script (baked slot anchors make un_MUSEUM
    //    Auto_NNN slots work — they never exist as GLB nodes).
    const script = Buffer.from(
      generateRoomScript({
        artworks,
        slots: placement.slots || [],
        artSize: ART_SIZE,
        rootScale,
      }),
      "utf8",
    );
    const scriptUrl = await uploadAsset({ baseUrl: BASE_URL, bytes: script, ext: "js", mime: "text/javascript" });

    const meta = {
      name: `MOCA · ${title}`,
      author: "Museum of Crypto Art",
      url: "https://museumofcryptoart.com/rooms/world",
      desc: `${placement.artworks.length} works · "${exhibition.name}" · curated with the MOCA world builder`,
    };

    // 4. Blueprint: create, or version-bump in place (entities rebuild live;
    //    the props admins tuned in-world ride along untouched).
    const existing = session.blueprints.get(bpId);
    if (!existing) {
      session.send("blueprintAdded", {
        id: bpId,
        version: 0,
        ...meta,
        image: null,
        model: modelUrl,
        script: scriptUrl,
        props: {},
        preload: false,
        public: false,
        locked: false,
        frozen: false,
        unique: false,
        scene: false,
        disabled: false,
      });
      stats.created++;
      console.log("  blueprint created");
    } else if (existing.model !== modelUrl || existing.script !== scriptUrl) {
      session.send("blueprintModified", {
        id: bpId,
        version: (existing.version ?? 0) + 1,
        ...meta,
        model: modelUrl,
        script: scriptUrl,
      });
      stats.updated++;
      console.log("  blueprint updated (curation pushed; in-world refinements kept)");
    } else {
      stats.unchanged++;
      console.log("  unchanged");
    }

    // 5. Entity: only created when missing, so room positions refined
    //    in-engine survive re-spawns. --relayout snaps them back. Entities
    //    from spawner versions that predate tile normalization (scale 1
    //    where the layout now calls for another scale) are healed in place.
    const existingEntity = session.entities.get(enId);
    if (!existingEntity) {
      session.send("entityAdded", {
        id: enId,
        type: "app",
        blueprint: bpId,
        position,
        quaternion,
        scale: scaleArr,
        mover: null,
        uploader: null,
        pinned: !UNPINNED,
        state: {},
      });
      console.log(`  placed at [${position.map((n) => n.toFixed(1)).join(", ")}] · scale ${rootScale.toFixed(3)}${UNPINNED ? " (unpinned)" : ""}`);
    } else {
      const eScale = existingEntity.scale || [1, 1, 1];
      const legacyUnscaled = Math.abs(eScale[0] - 1) < 1e-6 && Math.abs(rootScale - 1) > 1e-3;
      if (RELAYOUT || legacyUnscaled) {
        session.send("entityModified", { id: enId, position, quaternion, scale: scaleArr });
        console.log(RELAYOUT
          ? "  moved back to the museum layout (--relayout)"
          : "  healed legacy placement (tile normalization applied)");
      } else {
        console.log("  kept where admins arranged it in-world");
      }
    }

    stats.artworks += placement.artworks.length;
    expected.push({ bpId, enId, title });
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    stats.failed++;
    console.error(`  ✗ ${err.message}`);
  }
}

// Let the last packets land before disconnecting.
await new Promise((r) => setTimeout(r, 1200));
session.close();

// ------------------------------------------------------------- verify ----
if (VERIFY && expected.length) {
  console.log("\nVerifying…");
  const check = await HyperfySession.connect({ url: BASE_URL, name: "MOCA Verify" });
  let ok = 0;
  for (const e of expected) {
    const present = check.blueprints.has(e.bpId) && check.entities.has(e.enId);
    if (present) ok++;
    else console.error(`  ✗ "${e.title}" did not appear in the world`);
  }
  check.close();
  if (ok < expected.length) {
    console.error(`\n${ok}/${expected.length} rooms verified. If none appeared, the admin key is likely wrong.`);
    process.exit(1);
  }
  console.log(`  all ${ok} room(s) verified in the world.`);
}

console.log(`\n✔ ${stats.created} created, ${stats.updated} updated, ${stats.unchanged} unchanged, ${stats.failed} failed — ${stats.artworks} artwork(s) total.`);
console.log(`\nWalk in: ${BASE_URL}`);
console.log("Refine in-world (any admin): Tab = build mode · grab a room to rearrange");
console.log("(P unpins it first) · right-click a room → adjust artwork size, placards,");
console.log("lighting and video volume in the App pane. Re-run this command anytime to");
console.log("push curation updates — in-world arrangements are preserved.");
process.exit(stats.failed ? 1 : 0);
