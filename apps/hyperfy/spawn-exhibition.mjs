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
 * THE MUSEUM GUIDE (agentic VRM avatar):
 *   --guide                   also spawn the AI museum guide. This registers
 *                             the exhibition's context (rooms, architects,
 *                             artists, works) with the MOCA API — that's what
 *                             the guide answers from — and drops a talking
 *                             VRM avatar into the world (hold E to chat).
 *   --guide-name <name>       the guide's display name (default "Tsahafi")
 *   --guide-avatar <path|url> .vrm to embody (default: the museum's Omnimorph)
 *   --decc0 <token id>        Art DeCC0 persona the guide adopts (default
 *                             4209 = Tsahafi; souls come from the MOCA Codex
 *                             via /v1/decc0s)
 *   --soul <file.md>          a custom SOUL.md the guide embodies (beats --decc0)
 *   --soul-name <name>        display name for the custom soul
 *   --soulweaver <ref>        a Soulweaver soul, chainId:0xcontract:tokenId —
 *                             resolved by the MOCA API at answer time
 *   --api <url>               MOCA API base (default https://api.moca.qwellco.de)
 *
 * Privacy by design: the exhibition file lives on the curator's device. This
 * command is the explicit "upload it into Hyperfy" moment — nothing reaches a
 * world until the curator runs it (or uses the builder's Spawn dialog).
 */

import crypto from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  deterministicUuid,
  HyperfySession,
  uploadAsset,
  yawToQuaternion,
} from "./lib/protocol.mjs";
import { generateGuideScript } from "./lib/guide-script.mjs";
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
const GUIDE = flag("guide");
const GUIDE_NAME = opt("guide-name", "Tsahafi");
// Default body: the in-repo Omnimorph VRM when running from the monorepo,
// otherwise the museum-hosted copy.
const LOCAL_OMNIMORPH = new URL("../museum/public/avatars/omnimorph-3321.vrm", import.meta.url).pathname;
const GUIDE_AVATAR = opt(
  "guide-avatar",
  process.env.MOCA_GUIDE_AVATAR
  || (existsSync(LOCAL_OMNIMORPH)
    ? LOCAL_OMNIMORPH
    : "https://museumofcryptoart.com/avatars/omnimorph-3321.vrm"),
);
const DECC0_ID = Number(opt("decc0", "4209")) || 0;
const MOCA_API = (opt("api", process.env.MOCA_API_URL || "https://api.moca.qwellco.de")).replace(/\/+$/, "");

// Persona beyond DeCC0s: --soul <SOUL.md file> bakes a custom soul into the
// guide; --soulweaver <chainId:0xcontract:tokenId> references a Soulweaver
// soul the API resolves at answer time.
const SOUL_FILE = opt("soul", "");
const CUSTOM_SOUL = SOUL_FILE ? readFileSync(SOUL_FILE, "utf8").slice(0, 4000) : "";
const SOUL_NAME = opt(
  "soul-name",
  CUSTOM_SOUL.match(/^#\s*(?:SOUL\.md\s*[—-]\s*)?(.+)$/m)?.[1]?.trim().slice(0, 60) || "",
);
const SOUL_REF = (() => {
  const raw = opt("soulweaver", "");
  if (!raw) return null;
  const m = raw.match(/^(\d+):(0x[0-9a-fA-F]{40}):(.+)$/);
  if (!m) {
    console.error("--soulweaver expects chainId:0xcontract:tokenId");
    process.exit(1);
  }
  return { chainId: Number(m[1]), address: m[2], tokenId: m[3] };
})();


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

// ---------------------------------------------------------- museum guide ----
// The agentic guide: register the exhibition's context with the MOCA API
// (rooms + architects + artists + works — what the guide answers from), then
// drop a talking VRM avatar into the world. Idempotent like the rooms: the
// blueprint/entity ids derive from the exhibition key, so re-spawning updates
// the guide in place (and keeps wherever admins moved it).
if (GUIDE) {
  console.log(`\n→ Museum guide "${GUIDE_NAME}"${DECC0_ID ? ` (DeCC0 #${DECC0_ID} persona)` : ""}`);
  try {
    // The id must match what the guide app sends to /v1/guide/ask.
    const guideExhibitionId
      = exhibition.id || (exhibition.name || "exhibition").replace(/[^\w.:-]+/g, "-").toLowerCase();

    // 1. Register the exhibition context (the API enriches rooms/artworks
    //    from the museum's own data). Failure is not fatal — the guide spawns
    //    with baked suggestions and answers go offline-polite until the
    //    exhibition is registered.
    let suggestions = [];
    let counts = { rooms: exhibition.placements.length, artworks: 0 };
    try {
      const res = await fetch(`${MOCA_API}/v1/guide/exhibitions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "moca-exhibition@1",
          id: guideExhibitionId,
          name: exhibition.name,
          generator: exhibition.generator,
          placements: exhibition.placements.map((p) => ({
            uid: p.uid,
            room: { id: p.room.id, title: p.room.title },
            artworks: p.artworks.map((a) => ({ id: a.id, name: a.name, artist: a.artist })),
          })),
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        suggestions = data?.suggestions || [];
        counts = { rooms: data?.counts?.rooms ?? counts.rooms, artworks: data?.counts?.artworks ?? 0 };
        console.log(`  context registered with ${MOCA_API} (${counts.rooms} rooms, ${counts.artworks} works, ${data?.counts?.artists ?? 0} artists)`);
      } else {
        console.warn(`  ⚠ context registration failed (${res.status}) — the guide will run on baked knowledge`);
      }
    } catch (err) {
      console.warn(`  ⚠ MOCA API unreachable (${err.message}) — the guide will run on baked knowledge`);
    }

    // 2. The guide's body: a .vrm, uploaded content-addressed like any asset.
    //    A VRM blueprint model renders as an avatar in Hyperfy.
    let vrmBytes;
    if (/^https?:\/\//.test(GUIDE_AVATAR)) {
      const res = await fetch(GUIDE_AVATAR);
      if (!res.ok) throw new Error(`guide avatar unreachable (${res.status}) at ${GUIDE_AVATAR}`);
      vrmBytes = Buffer.from(await res.arrayBuffer());
    } else {
      vrmBytes = readFileSync(GUIDE_AVATAR);
    }
    const avatarUrl = await uploadAsset({ baseUrl: BASE_URL, bytes: vrmBytes, ext: "vrm", mime: "model/gltf-binary" });
    console.log(`  avatar ${avatarUrl} (${(vrmBytes.length / 1e6).toFixed(1)} MB)`);

    // 3. The guide's mind: the generated app script (server side talks to the
    //    MOCA API, client side renders the conversation panel).
    const guideScript = Buffer.from(
      generateGuideScript({
        exhibitionId: guideExhibitionId,
        exhibitionName: exhibition.name,
        apiUrl: MOCA_API,
        guideName: GUIDE_NAME,
        decc0Id: DECC0_ID,
        customSoul: CUSTOM_SOUL,
        soulName: SOUL_NAME,
        soulRef: SOUL_REF,
        suggestions,
        roomCount: counts.rooms,
        artworkCount: counts.artworks,
      }),
      "utf8",
    );
    const guideScriptUrl = await uploadAsset({ baseUrl: BASE_URL, bytes: guideScript, ext: "js", mime: "text/javascript" });

    // 4. Place the guide at the heart of the exhibition, facing its center.
    const k = TILE_METERS / BUILDER_TILE;
    let cx = 0;
    let cz = 0;
    for (const p of exhibition.placements) {
      cx += k * p.position[0];
      cz += k * p.position[2];
    }
    cx /= exhibition.placements.length || 1;
    cz /= exhibition.placements.length || 1;
    const gPosition = [cx, 0, cz + TILE_METERS * 0.55];
    const gQuaternion = yawToQuaternion(Math.PI); // face the exhibition center

    const bpId = await deterministicUuid(`${exhibitionKey}:guide:blueprint`);
    const enId = await deterministicUuid(`${exhibitionKey}:guide:entity`);
    const meta = {
      name: `MOCA · Museum Guide`,
      author: "Museum of Crypto Art",
      url: "https://museumofcryptoart.com/rooms/world",
      desc: `${GUIDE_NAME} — the AI guide of "${exhibition.name}". Hold E to talk.`,
    };
    const props = {
      guideName: GUIDE_NAME,
      decc0: DECC0_ID,
      customSoul: CUSTOM_SOUL,
      apiUrl: MOCA_API,
      exhibitionId: guideExhibitionId,
      exhibitionName: exhibition.name,
    };

    const existing = session.blueprints.get(bpId);
    if (!existing) {
      session.send("blueprintAdded", {
        id: bpId,
        version: 0,
        ...meta,
        image: null,
        model: avatarUrl,
        script: guideScriptUrl,
        props,
        preload: false,
        public: false,
        locked: false,
        frozen: false,
        unique: false,
        scene: false,
        disabled: false,
      });
      stats.created++;
      console.log("  guide blueprint created");
    } else if (existing.model !== avatarUrl || existing.script !== guideScriptUrl) {
      session.send("blueprintModified", {
        id: bpId,
        version: (existing.version ?? 0) + 1,
        ...meta,
        model: avatarUrl,
        script: guideScriptUrl,
        props: { ...existing.props, ...props },
      });
      stats.updated++;
      console.log("  guide updated (avatar/knowledge pushed; in-world tweaks kept)");
    } else {
      stats.unchanged++;
      console.log("  guide unchanged");
    }

    if (!session.entities.get(enId)) {
      session.send("entityAdded", {
        id: enId,
        type: "app",
        blueprint: bpId,
        position: gPosition,
        quaternion: gQuaternion,
        scale: [1, 1, 1],
        mover: null,
        uploader: null,
        pinned: !UNPINNED,
        state: {},
      });
      console.log(`  guide standing at [${gPosition.map((n) => n.toFixed(1)).join(", ")}]`);
    } else {
      console.log("  guide kept where admins placed it in-world");
    }
    expected.push({ bpId, enId, title: `Museum guide "${GUIDE_NAME}"` });
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
