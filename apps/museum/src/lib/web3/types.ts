/** Shared holdings shapes — client-safe (no server-only imports). */

export interface NftItem {
  chainId: number;
  contract: string;
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  /**
   * Where clicking the thumbnail takes you (opened in a new tab). Set per
   * collection server-side: Art DeCC0s → the DeCC0s Codex, MOCA ROOMs → the
   * room's museum page. Null when there's no canonical destination.
   */
  linkUrl?: string | null;
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
