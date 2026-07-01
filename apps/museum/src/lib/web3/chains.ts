import "server-only";
import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, polygon } from "viem/chains";
import { MAINNET, POLYGON, type ChainId } from "./assets";

/**
 * viem read clients, one per chain. RPC urls come from the environment
 * (ETH_RPC_URL is already used by room-owner.ts); both fall back to a public
 * endpoint so reads still work without a paid provider. Server-only — the
 * account view fetches through /api/holdings, never straight from the browser.
 */

const RPC: Record<ChainId, string> = {
  [MAINNET]: process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com",
  [POLYGON]: process.env.POLYGON_RPC_URL || "https://polygon-rpc.com",
};

const CHAIN = { [MAINNET]: mainnet, [POLYGON]: polygon } as const;

const clients = new Map<ChainId, PublicClient>();

export function getPublicClient(chainId: ChainId): PublicClient {
  let client = clients.get(chainId);
  if (!client) {
    client = createPublicClient({
      chain: CHAIN[chainId],
      transport: http(RPC[chainId]),
    }) as PublicClient;
    clients.set(chainId, client);
  }
  return client;
}
