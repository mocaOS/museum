import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import { encodeURL } from "js-base64";
import { CustomDirectusTypes } from "./types";

// ─── Toggle: set to true to run against the live database ───
const USE_LIVE_DATABASE = true;

const DIRECTUS_URL = USE_LIVE_DATABASE
  ? "https://api.moca.qwellco.de"
  : "http://localhost:8055";

const DIRECTUS_TOKEN = USE_LIVE_DATABASE
  ? process.env.DIRECTUS_API_KEY!
  : process.env.DIRECTUS_API_KEY_DEV!;

const OPENSEA_API_KEY = process.env.OPENSEA_API_KEY!;

const BATCH_SIZE = 100;
const OPENSEA_DELAY_MS = 1000;
const MAX_RETRIES = 3;

const client = createDirectus<CustomDirectusTypes>(DIRECTUS_URL)
  .with(staticToken(DIRECTUS_TOKEN))
  .with(rest());

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchOpenSeaData(chain: string, address: string, identifier: string) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://api.opensea.io/api/v2/chain/${chain}/contract/${address}/nfts/${identifier}`,
      { headers: { "X-API-KEY": OPENSEA_API_KEY } },
    );

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const backoff = attempt * 2000;
      console.log(`⏳ Rate limited, waiting ${backoff}ms before retry ${attempt}/${MAX_RETRIES}...`);
      await sleep(backoff);
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    return data.nft;
  }
}

async function fetchMediaInfo(url: string): Promise<unknown | null> {
  try {
    const encoded = encodeURL(url.replace("w=500", "w=2048"));
    const res = await fetch(
      `https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encoded}`,
      { signal: AbortSignal.timeout(45000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.data ?? null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n🎯 Target: ${DIRECTUS_URL}`);
  console.log(`   Mode:   ${USE_LIVE_DATABASE ? "LIVE" : "LOCAL"}\n`);

  let offset = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (true) {
    const nfts = await client.request(
      readItems("nfts", {
        fields: [ "id", "identifier", { contract: [ "address", "chain" ] } ],
        limit: BATCH_SIZE,
        offset,
      }),
    );

    if (!nfts.length) break;

    for (const nft of nfts) {
      const contract = nft.contract as { address: string; chain: string } | null;

      if (!contract?.address || !contract?.chain || !nft.identifier) {
        console.log(`⏭  Skipping NFT #${nft.id} — missing contract or identifier`);
        skipped++;
        continue;
      }

      try {
        const openseaData = await fetchOpenSeaData(contract.chain, contract.address, nft.identifier);

        const updatePayload: Record<string, unknown> = {
          name: openseaData.name?.slice(0, 255) ?? null,
          collection: openseaData.collection ?? null,
          response_opensea: openseaData,
        };

        // Fetch media info from updated OpenSea URLs
        if (openseaData.image_url) {
          const media_info = await fetchMediaInfo(openseaData.image_url);
          if (media_info) updatePayload.media_info = media_info;
        }

        if (openseaData.display_image_url) {
          const display_media_info = await fetchMediaInfo(openseaData.display_image_url);
          if (display_media_info) updatePayload.display_media_info = display_media_info;
        }

        if (openseaData.display_animation_url) {
          const display_animation_info = await fetchMediaInfo(openseaData.display_animation_url);
          if (display_animation_info) updatePayload.display_animation_info = display_animation_info;
        }

        await client.request(updateItem("nfts", nft.id, updatePayload));

        updated++;
        console.log(`✅ [${updated + skipped + failed}] Updated NFT #${nft.id} — ${openseaData.name ?? "unnamed"}`);
      } catch (error: any) {
        failed++;
        console.error(`❌ [${updated + skipped + failed}] Failed NFT #${nft.id} (${contract.address}/${nft.identifier}) — ${error.message}`);
      }

      await sleep(OPENSEA_DELAY_MS);
    }

    offset += BATCH_SIZE;
  }

  console.log(`\n🏁 Done! Updated: ${updated} | Skipped: ${skipped} | Failed: ${failed}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
