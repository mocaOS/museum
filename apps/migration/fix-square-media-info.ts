import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import { encodeURL } from "js-base64";
import { CustomDirectusTypes } from "./types";

/**
 * Fix square-cropped artwork media in the `nfts` table.
 *
 * OpenSea's conversion CDN (i2c.seadn.io) serves ≤500px variants that are
 * frequently square-CROPPED (a 1026×1431 portrait comes back 500×500). The
 * historical `media_info` blobs were probed from those variants, so both the
 * stored URL and the stored width/height describe the crop — which is why the
 * museum rendered non-square works as squares.
 *
 * This script re-probes `media_info` from `response_opensea.original_image_url`
 * (the untouched original file, OpenSea API v2) and writes the result — true
 * URL, true dimensions — back to Directus. `display_media_info` (genuinely the
 * small display thumbnail) and `display_animation_info` are left untouched.
 *
 * Run (from apps/migration):
 *   DIRECTUS_API_KEY=<token> npx tsx fix-square-media-info.ts            # live, dry-run
 *   DIRECTUS_API_KEY=<token> npx tsx fix-square-media-info.ts --write    # live, apply
 *   DIRECTUS_API_KEY_DEV=<t> npx tsx fix-square-media-info.ts --local    # localhost:8055
 */

const WRITE = process.argv.includes("--write");
const USE_LIVE_DATABASE = !process.argv.includes("--local");

const DIRECTUS_URL = USE_LIVE_DATABASE
  ? "https://api.moca.qwellco.de"
  : "http://localhost:8055";

const DIRECTUS_TOKEN = USE_LIVE_DATABASE
  ? process.env.DIRECTUS_API_KEY
  : process.env.DIRECTUS_API_KEY_DEV;

if (WRITE && !DIRECTUS_TOKEN) {
  console.error("--write needs DIRECTUS_API_KEY (live) or DIRECTUS_API_KEY_DEV (--local).");
  process.exit(1);
}

const BATCH_SIZE = 100;
const PROBE_DELAY_MS = 150;

// Reads on the nfts collection are public; a token is only needed to write.
const base = createDirectus<CustomDirectusTypes>(DIRECTUS_URL);
const client = (DIRECTUS_TOKEN ? base.with(staticToken(DIRECTUS_TOKEN)) : base).with(rest());

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface MediaInfo {
  url?: string;
  type?: string;
  content_type?: string;
  width?: number;
  height?: number;
}

interface ResponseOpensea {
  image_url?: string;
  original_image_url?: string;
}

// The conversion CDN whose variants may be square crops.
const CONVERSION_CDN = "i2c.seadn.io";
// Originals can be any file type; only probe ones the still pipeline renders.
const NON_IMAGE_EXT = /\.(mp4|webm|mov|avi|glb|gltf|html?|js)(\?|$)/i;

async function probeMediaInfo(url: string): Promise<MediaInfo | null> {
  try {
    const encoded = encodeURL(url.replace("w=500", "w=2048"));
    const res = await fetch(
      `https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encoded}`,
      { signal: AbortSignal.timeout(45000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data as MediaInfo) ?? null;
  } catch {
    return null;
  }
}

const IPFS_GATEWAY = "https://ipfs.qwellcode.de/ipfs/";

/** The probe service needs plain http(s) — resolve ipfs:// URIs to a gateway. */
function resolveProbeUrl(url: string): string {
  if (url.startsWith("ipfs://")) {
    return IPFS_GATEWAY + url.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  return url;
}

/** The original-file URL worth probing, or null when there's nothing better. */
function probeTarget(nft: { media_info: unknown; response_opensea: unknown }): string | null {
  const mi = nft.media_info as MediaInfo | null;
  const ro = nft.response_opensea as ResponseOpensea | null;
  const original = ro?.original_image_url ? resolveProbeUrl(ro.original_image_url) : undefined;
  if (!original || NON_IMAGE_EXT.test(original)) return null;

  // No stored media at all but an image original exists → probe it.
  if (!mi?.url) return original;

  if (mi.type !== "image") return null;
  if (mi.url === original) return null;

  // Stored blob describes a conversion-CDN variant whose dimensions are
  // square (likely a crop) or missing → replace with the original.
  const square = !!mi.width && mi.width === mi.height;
  const missing = !mi.width || !mi.height;
  if (mi.url.includes(CONVERSION_CDN) && (square || missing)) return original;

  return null;
}

async function main() {
  console.log(`\n🎯 Target: ${DIRECTUS_URL}`);
  console.log(`   Mode:   ${WRITE ? "WRITE" : "DRY-RUN (pass --write to apply)"}\n`);

  let offset = 0;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const nfts = await client.request(
      readItems("nfts", {
        fields: ["id", "name", "media_info", "response_opensea"],
        limit: BATCH_SIZE,
        offset,
        sort: ["id"],
      })
    );
    if (!nfts.length) break;

    for (const nft of nfts) {
      scanned++;
      const target = probeTarget(nft as never);
      if (!target) {
        skipped++;
        continue;
      }

      if (!WRITE) {
        // Dry-run: list candidates without hammering the probe service.
        const old = nft.media_info as MediaInfo | null;
        updated++;
        console.log(
          `🔍 [${scanned}] NFT #${nft.id} "${(nft.name as string) || "?"}" ` +
            `${old?.width ?? "?"}×${old?.height ?? "?"} → probe ${target.slice(0, 70)}`
        );
        continue;
      }

      const probed = await probeMediaInfo(target);
      await sleep(PROBE_DELAY_MS);

      if (!probed || probed.type === "video" || probed.type === "model") {
        // Unreachable original (dead IPFS gateway etc.) or not a still — keep
        // the CDN variant rather than breaking the work.
        failed++;
        console.log(`⚠️  [${scanned}] NFT #${nft.id} — probe failed/non-still for ${target.slice(0, 80)}`);
        continue;
      }

      const old = nft.media_info as MediaInfo | null;
      console.log(
        `${WRITE ? "✅" : "🔍"} [${scanned}] NFT #${nft.id} "${(nft.name as string) || "?"}" ` +
          `${old?.width ?? "?"}×${old?.height ?? "?"} → ${probed.width}×${probed.height} (${target.slice(0, 60)})`
      );

      if (WRITE) {
        try {
          await client.request(updateItem("nfts", nft.id, { media_info: probed as never }));
          updated++;
        } catch (error) {
          failed++;
          console.error(`❌ NFT #${nft.id} update failed — ${(error as Error).message}`);
        }
      } else {
        updated++;
      }
    }

    offset += BATCH_SIZE;
    console.log(`— batch done, offset ${offset} —`);
  }

  console.log(
    `\n🏁 Done. Scanned: ${scanned} | ${WRITE ? "Updated" : "Would update"}: ${updated} | Already fine: ${skipped} | Probe failures: ${failed}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
