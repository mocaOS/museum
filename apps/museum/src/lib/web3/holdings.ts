import "server-only";
import { erc20Abi, formatUnits, getAddress } from "viem";
import Moralis from "moralis";
import { getPublicClient } from "./chains";
import {
  MAINNET,
  POLYGON,
  MOCA_TOKEN,
  NFT_COLLECTIONS,
  MORALIS_NFT_ADDRESSES,
  DECC0S_API,
  type ChainId,
} from "./assets";
import type { NftItem, CollectionHoldings, Holdings } from "./types";

/**
 * Read a wallet's MOCA-ecosystem holdings across Ethereum + Polygon in parallel.
 *
 * - $MOCA (ERC-20): viem `balanceOf` on both chains (no API key — just RPC).
 * - Art DeCC0s + MOCA ROOMs (ERC-721): Moralis `getWalletNFTs` scoped to those
 *   contract addresses, queried on both chains (a contract absent on a chain
 *   just returns nothing, so we never guess which chain a collection is on).
 *
 * Every source fails soft: a dead RPC or a missing MORALIS_API_KEY yields an
 * empty result for that source, never a thrown route.
 */

// --- Moralis --------------------------------------------------------------

let moralisStarted = false;

async function ensureMoralis(): Promise<boolean> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) return false;
  if (!moralisStarted) {
    try {
      await Moralis.start({ apiKey });
    } catch (e: unknown) {
      // Hot-reload in dev re-runs this; ignore the "already started" error.
      if (!(e instanceof Error && e.message.includes("started already"))) {
        return false;
      }
    }
    moralisStarted = true;
  }
  return true;
}

const MORALIS_CHAIN: Record<ChainId, string> = {
  [MAINNET]: "0x1",
  [POLYGON]: "0x89",
};

/** Rewrite ipfs:// / ar:// to gateways; pass data:/https: through. */
function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  if (url.startsWith("ipfs://")) return `https://gateway.ipfs.io/ipfs/${url.slice(7)}`;
  if (url.startsWith("ar://")) return `https://arweave.net/${url.slice(5)}`;
  if (url.includes("ipfs.moralis.io")) {
    const match = url.match(/\/ipfs\/(.+)/);
    if (match) return `https://gateway.ipfs.io/ipfs/${match[1]}`;
  }
  return url;
}

// Safety cap so a whale wallet can't spin forever: 20 pages × 100 = 2000 NFTs
// per collection-set per chain. We log if we hit it rather than silently drop.
const MAX_NFT_PAGES = 20;

async function fetchNftsOnChain(
  owner: string,
  chainId: ChainId,
): Promise<NftItem[]> {
  try {
    const items: NftItem[] = [];
    let page = await Moralis.EvmApi.nft.getWalletNFTs({
      address: owner,
      chain: MORALIS_CHAIN[chainId],
      tokenAddresses: MORALIS_NFT_ADDRESSES,
      limit: 100,
      normalizeMetadata: true,
      mediaItems: true,
    });

    let pages = 0;
    while (true) {
      for (const nft of page.result) {
        const meta = nft.metadata as Record<string, unknown> | null;
        const mediaUrl =
          (nft.media?.originalMediaUrl as string | undefined) ??
          (meta?.image as string | undefined) ??
          null;
        items.push({
          chainId,
          contract: nft.tokenAddress.lowercase,
          tokenId: String(nft.tokenId),
          name: (meta?.name as string | undefined) ?? nft.name ?? null,
          imageUrl: resolveImageUrl(mediaUrl),
        });
      }
      pages += 1;
      if (!page.hasNext() || pages >= MAX_NFT_PAGES) {
        if (page.hasNext()) {
          console.warn(
            `[holdings] hit ${MAX_NFT_PAGES}-page cap for ${owner} on chain ${chainId}; some NFTs omitted`,
          );
        }
        break;
      }
      page = await page.next();
    }
    return items;
  } catch {
    return [];
  }
}

// --- Art DeCC0s (MOCA Codex, no Moralis) ----------------------------------

const DECC0S_CONTRACT = (
  NFT_COLLECTIONS.find((c) => c.key === "decc0s")?.address ?? ""
).toLowerCase();

interface CodexItem {
  id: number;
  name?: string | string[] | null;
  /** Default composed image (character on background) — what we want. */
  thumbnail?: string | null;
  /** Layer-only variants — used only as defensive fallbacks. */
  thumbnail_character?: string | null;
  thumbnail_background?: string | null;
}

/**
 * Art DeCC0s owned by a wallet, from MOCA's own Codex (api.decc0s.com) instead
 * of Moralis — saves Moralis quota. Ownership is the Codex `owner` field
 * (lowercase); note it can lag on-chain reality until the Codex is re-synced.
 * CORS-open, no API key. thumbnail_character is a Codex asset UUID.
 */
async function fetchDecc0sFromCodex(owner: string): Promise<NftItem[]> {
  try {
    const params = new URLSearchParams({
      "filter[owner][_eq]": owner.toLowerCase(),
      fields: "id,name,thumbnail,thumbnail_character,thumbnail_background",
      limit: "-1",
    });
    const res = await fetch(`${DECC0S_API}/items/codex?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: CodexItem[] };
    return (json.data ?? []).map((d) => {
      // The default composed thumbnail (not a single character/background layer).
      const thumb =
        d.thumbnail ?? d.thumbnail_character ?? d.thumbnail_background;
      return {
        chainId: MAINNET,
        contract: DECC0S_CONTRACT,
        tokenId: String(d.id),
        name: (Array.isArray(d.name) ? d.name[0] : d.name) ?? `#${d.id}`,
        imageUrl: thumb ? `${DECC0S_API}/assets/${thumb}?key=s256` : null,
      };
    });
  } catch {
    return [];
  }
}

// --- MOCA ROOMs enrichment (public Directus, no API key) ------------------

const DIRECTUS_URL = (
  process.env.DIRECTUS_URL || "https://api.moca.qwellco.de"
).replace(/\/$/, "");

interface RoomRow {
  token_id?: string | null;
  title?: string | null;
  image?: string | null;
}

/**
 * Moralis tells us WHICH ROOM token ids the wallet holds; the museum's own
 * Directus `rooms` collection has the curated title + a rendered preview image
 * per `token_id` (public read — same source the /rooms gallery uses). Swap the
 * on-chain IPFS image for a light 512w WebP thumbnail and the raw token name for
 * the curated room title. This mirrors the thumbnail_url the /v1/rooms API now
 * exposes for external integrators. Fails soft: on any error the ROOMs keep
 * their Moralis image/name.
 */
async function enrichRoomsFromDirectus(rooms: NftItem[]): Promise<NftItem[]> {
  if (rooms.length === 0) return rooms;
  try {
    const params = new URLSearchParams({
      "filter[token_id][_in]": rooms.map((r) => r.tokenId).join(","),
      fields: "token_id,title,image",
      limit: "-1",
    });
    const res = await fetch(`${DIRECTUS_URL}/items/rooms?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return rooms;
    const json = (await res.json()) as { data?: RoomRow[] };
    const byToken = new Map(
      (json.data ?? []).map((r) => [String(r.token_id), r]),
    );
    return rooms.map((room) => {
      const row = byToken.get(room.tokenId);
      if (!row) return room;
      return {
        ...room,
        name: row.title ?? room.name,
        imageUrl: row.image
          ? `${DIRECTUS_URL}/assets/${row.image}?width=512&quality=80&format=webp`
          : room.imageUrl,
      };
    });
  } catch {
    return rooms;
  }
}

// --- $MOCA ERC-20 ---------------------------------------------------------

let tokenMeta: { decimals: number; symbol: string } | null = null;

async function readMocaMeta(): Promise<{ decimals: number; symbol: string }> {
  if (tokenMeta) return tokenMeta;
  try {
    const client = getPublicClient(MAINNET);
    const [decimals, symbol] = await Promise.all([
      client.readContract({
        address: MOCA_TOKEN[MAINNET],
        abi: erc20Abi,
        functionName: "decimals",
      }),
      client.readContract({
        address: MOCA_TOKEN[MAINNET],
        abi: erc20Abi,
        functionName: "symbol",
      }),
    ]);
    tokenMeta = { decimals: Number(decimals), symbol };
  } catch {
    tokenMeta = { decimals: 18, symbol: "MOCA" };
  }
  return tokenMeta;
}

async function readMocaBalance(owner: string, chainId: ChainId): Promise<bigint> {
  try {
    const client = getPublicClient(chainId);
    return await client.readContract({
      address: MOCA_TOKEN[chainId],
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [getAddress(owner)],
    });
  } catch {
    return BigInt(0);
  }
}

// --- Public API -----------------------------------------------------------

export async function getHoldings(address: string): Promise<Holdings> {
  const owner = getAddress(address); // throws on a malformed address (route validates first)

  // Kick off every read at once: $MOCA balances (both chains), Art DeCC0s from
  // the Codex, and Moralis init — all independent.
  const [meta, ethBal, polBal, decc0sItems, moralisReady] = await Promise.all([
    readMocaMeta(),
    readMocaBalance(owner, MAINNET),
    readMocaBalance(owner, POLYGON),
    fetchDecc0sFromCodex(owner),
    ensureMoralis(),
  ]);

  // Moralis now only resolves the collections still flagged `source: "moralis"`
  // (MOCA ROOMs); DeCC0s comes from the Codex above.
  const moralisNfts = moralisReady
    ? (
        await Promise.all([
          fetchNftsOnChain(owner, MAINNET),
          fetchNftsOnChain(owner, POLYGON),
        ])
      ).flat()
    : [];

  const collections: CollectionHoldings[] = await Promise.all(
    NFT_COLLECTIONS.map(async (c) => {
      if (c.source === "codex") {
        return { key: c.key, label: c.label, items: decc0sItems };
      }
      const items = moralisNfts.filter(
        (n) => n.contract.toLowerCase() === c.address.toLowerCase(),
      );
      return {
        key: c.key,
        label: c.label,
        items:
          c.key === "rooms" ? await enrichRoomsFromDirectus(items) : items,
      };
    }),
  );

  const eth = formatUnits(ethBal, meta.decimals);
  const pol = formatUnits(polBal, meta.decimals);
  const total = formatUnits(ethBal + polBal, meta.decimals);

  return {
    address: owner.toLowerCase(),
    moca: {
      ethereum: eth,
      polygon: pol,
      total,
      decimals: meta.decimals,
      symbol: meta.symbol,
    },
    collections,
  };
}
