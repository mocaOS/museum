"use client";

import { useAppKitAccount, useAppKitNetwork } from "@reown/appkit/react";

/**
 * The active web3 session primitive: the connected address, chain, and status.
 * Wraps AppKit's hooks so product code never imports AppKit directly. Address is
 * lowercased for stable comparisons/keys.
 */
export function useWallet() {
  const { address, isConnected, status } = useAppKitAccount();
  const { chainId } = useAppKitNetwork();

  return {
    address: address?.toLowerCase(),
    isConnected,
    isLoading: status === "connecting" || status === "reconnecting",
    chainId: chainId ? Number(chainId) : undefined,
  };
}
