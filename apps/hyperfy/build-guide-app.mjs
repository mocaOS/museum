#!/usr/bin/env node
/**
 * Build the MOCA museum guide as a portable `.hyp` app file.
 *
 * Drop the file into ANY Hyperfy world in build mode (drag it onto the
 * window) and the guide stands where you dropped it — VRM body + agentic
 * script bundled, no world URL, no admin key, no spawner run. Same guide as
 * `spawn-exhibition.mjs --guide`, packaged for per-click upload.
 *
 *   node build-guide-app.mjs my-show.moca-exhibition.json \
 *     [--guide-name Tsahafi] [--guide-avatar path|url] [--decc0 4209] \
 *     [--soul SOUL.md] [--soul-name Name] [--soulweaver chainId:0x…:tokenId] \
 *     [--api https://api.moca.qwellco.de] [--no-register] [-o guide.hyp]
 *
 * Building the file registers the exhibition's context (rooms, architects,
 * artists, works) with the MOCA API — that's what the guide answers from,
 * and the explicit moment curation data leaves your device (skip with
 * --no-register if the exhibition is already registered). The dropped app
 * stays retargetable in-world: exhibition id, DeCC0 persona, name and API
 * live in its inspector (right-click → App pane).
 */

import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateGuideScript } from "./lib/guide-script.mjs";
import { buildHyp, hypAssetUrl } from "./lib/hyp.mjs";

// ---------------------------------------------------------------- args ----
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && a.endsWith(".json"));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

if (!file) {
  console.error("Usage: node build-guide-app.mjs <exhibition.json> [--decc0 4209] [-o guide.hyp]");
  process.exit(1);
}

const GUIDE_NAME = opt("guide-name", "Tsahafi");
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

const REGISTER = !flag("no-register");

const exhibition = JSON.parse(readFileSync(file, "utf8"));
if (exhibition.format !== "moca-exhibition@1") {
  console.error(`Unsupported format: ${exhibition.format}`);
  process.exit(1);
}

const exhibitionId
  = exhibition.id || (exhibition.name || "exhibition").replace(/[^\w.:-]+/g, "-").toLowerCase();
const slug = (exhibition.name || "exhibition").replace(/[^\w-]+/g, "-").toLowerCase();
const outFlag = args.findIndex((a) => a === "-o" || a === "--o" || a === "--out");
const OUT = outFlag >= 0 ? args[outFlag + 1] : `${slug}-guide.hyp`;

console.log(`Exhibition: "${exhibition.name}" — guide "${GUIDE_NAME}"${DECC0_ID ? ` (DeCC0 #${DECC0_ID} persona)` : ""}`);

// 1. Register the exhibition context (what the guide answers from).
let suggestions = [];
let counts = { rooms: exhibition.placements.length, artworks: 0 };
if (REGISTER) {
  try {
    const res = await fetch(`${MOCA_API}/v1/guide/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "moca-exhibition@1",
        id: exhibitionId,
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
      console.log(`Context registered with ${MOCA_API} (${counts.rooms} rooms, ${counts.artworks} works, ${data?.counts?.artists ?? 0} artists)`);
    } else {
      console.warn(`⚠ context registration failed (${res.status}) — the guide will run on baked knowledge`);
    }
  } catch (err) {
    console.warn(`⚠ MOCA API unreachable (${err.message}) — the guide will run on baked knowledge`);
  }
}

// 2. The guide's body (.vrm) and mind (generated script).
let vrmBytes;
if (/^https?:\/\//.test(GUIDE_AVATAR)) {
  const res = await fetch(GUIDE_AVATAR);
  if (!res.ok) {
    console.error(`Guide avatar unreachable (${res.status}) at ${GUIDE_AVATAR}`);
    process.exit(1);
  }
  vrmBytes = Buffer.from(await res.arrayBuffer());
} else {
  vrmBytes = readFileSync(GUIDE_AVATAR);
}
const avatarAssetUrl = hypAssetUrl(vrmBytes, "vrm");

const scriptBytes = Buffer.from(
  generateGuideScript({
    exhibitionId,
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
const scriptAssetUrl = hypAssetUrl(scriptBytes, "js");

// 3. Bundle. The engine assigns fresh blueprint/entity ids on drop.
const hyp = buildHyp({
  blueprint: {
    id: crypto.randomUUID(),
    version: 0,
    name: "MOCA · Museum Guide",
    author: "Museum of Crypto Art",
    url: "https://museumofcryptoart.com/rooms/world",
    desc: `${GUIDE_NAME} — the AI guide of "${exhibition.name}". Hold E to talk.`,
    image: null,
    model: avatarAssetUrl,
    script: scriptAssetUrl,
    props: {
      guideName: GUIDE_NAME,
      decc0: DECC0_ID,
      customSoul: CUSTOM_SOUL,
      apiUrl: MOCA_API,
      exhibitionId,
      exhibitionName: exhibition.name,
    },
    preload: false,
    public: false,
    locked: false,
    frozen: false,
    unique: false,
    scene: false,
    disabled: false,
  },
  assets: [
    { type: "avatar", url: avatarAssetUrl, bytes: vrmBytes, mime: "model/gltf-binary" },
    { type: "script", url: scriptAssetUrl, bytes: scriptBytes, mime: "text/javascript" },
  ],
});

writeFileSync(OUT, hyp);
console.log(`\n✔ ${OUT} (${(hyp.length / 1e6).toFixed(1)} MB)`);
console.log("Drop it into any Hyperfy world: Tab (build mode) → drag the file onto the window.");
console.log("Right-click the guide → App pane to retarget exhibition / persona / API.");
