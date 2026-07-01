"use client";

import { useQueries } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";

/**
 * Reverse-resolve a batch of ETH addresses to their primary ENS names on
 * mainnet. viem's `getEnsName` goes through the Universal Resolver and
 * forward-verifies the result, so a returned name is safe to display. Results
 * are react-query cached (1h fresh) and deduped by address, so the account
 * label and every table row that shows the same address share one lookup.
 *
 * Returns a lowercased-address → name|null map.
 */
export function useEnsNames(
  addresses: (string | null | undefined)[],
): Record<string, string | null> {
  const client = usePublicClient({ chainId: 1 });

  const unique = Array.from(
    new Set(
      addresses
        .filter((a): a is string => !!a)
        .map((a) => a.toLowerCase()),
    ),
  );

  const results = useQueries({
    queries: unique.map((addr) => ({
      queryKey: ["ens-name", addr],
      queryFn: async () => {
        if (!client) return null;
        try {
          return await client.getEnsName({ address: addr as `0x${string}` });
        } catch {
          return null;
        }
      },
      enabled: !!client,
      staleTime: 60 * 60 * 1000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: 1,
    })),
  });

  const map: Record<string, string | null> = {};
  unique.forEach((addr, i) => {
    map[addr] = results[i]?.data ?? null;
  });
  return map;
}
