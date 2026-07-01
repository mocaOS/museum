/** Shared holdings shapes — client-safe (no server-only imports). */

export interface NftItem {
  chainId: number;
  contract: string;
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
}

export interface CollectionHoldings {
  key: string;
  label: string;
  items: NftItem[];
}

export interface MocaBalance {
  /** Formatted decimal string, e.g. "1234.56". */
  ethereum: string;
  polygon: string;
  total: string;
  decimals: number;
  symbol: string;
}

export interface Holdings {
  address: string;
  moca: MocaBalance;
  collections: CollectionHoldings[];
}
