/**
 * On-chain assets the account view surfaces for a connected wallet.
 *
 * Chain ids: 1 = Ethereum mainnet, 137 = Polygon. $MOCA is an ERC-20 that lives
 * on both chains (different addresses); Art DeCC0s and MOCA ROOMs are ERC-721
 * collections. We read every asset on both chains in parallel — a contract that
 * doesn't exist on a given chain simply returns nothing, so we never have to
 * hard-code which chain a collection lives on.
 */

export const MAINNET = 1 as const;
export const POLYGON = 137 as const;

export type ChainId = typeof MAINNET | typeof POLYGON;

/** $MOCA ERC-20, keyed by chain. */
export const MOCA_TOKEN: Record<ChainId, `0x${string}`> = {
  [MAINNET]: "0x9ac07635ddbde5db18648c360defb00f5f22537e",
  [POLYGON]: "0xce899f26928a2b21c6a2fddd393ef37c61dba918",
};

export interface NftCollection {
  key: string;
  label: string;
  address: `0x${string}`;
  /**
   * Where we read this collection's holdings from:
   * - "codex"   → MOCA's own DeCC0s Codex API (no Moralis quota used)
   * - "moralis" → Moralis getWalletNFTs
   */
  source: "codex" | "moralis";
}

/** ERC-721 collections we surface for the connected wallet. */
export const NFT_COLLECTIONS: NftCollection[] = [
  {
    key: "decc0s",
    label: "Art DeCC0s",
    address: "0x97f69e1f54a4b10d934ff67e65b7ecfbab6ec652",
    // Served from the internal Codex to save Moralis calls (see holdings.ts).
    source: "codex",
  },
  {
    key: "rooms",
    label: "MOCA ROOMs",
    // Same contract room-owner.ts reads (ROOMS_CONTRACT), Ethereum mainnet.
    address: "0x87d04ff86cafee75d572691b31509f72c0088c2b",
    source: "moralis",
  },
];

/** Only the collections we still resolve through Moralis (queried on both chains). */
export const MORALIS_NFT_ADDRESSES = NFT_COLLECTIONS.filter(
  (c) => c.source === "moralis",
).map((c) => c.address);

/** Public, CORS-open MOCA DeCC0s Codex (api.decc0s.com) — no API key. */
export const DECC0S_API = "https://api.decc0s.com";
