"use client";

import { createAppKit } from "@reown/appkit/react";
import { cookieToInitialState, WagmiProvider, type Config } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { cookieStorage, createStorage, reconnect } from "@wagmi/core";
import { mainnet, polygon, type AppKitNetwork } from "@reown/appkit/networks";
import { type ReactNode, useState, useEffect } from "react";

/**
 * Global web3 session for the museum — same stack as the soulweaver app:
 * Reown AppKit + the wagmi adapter (wagmi v3 + viem). Connecting a wallet gives
 * the whole app an active session (address + chain) to build on, and the
 * account view reads holdings server-side via /api/holdings.
 *
 * Ethereum + Polygon only — the two chains the MOCA assets ($MOCA, Art DeCC0s,
 * MOCA ROOMs) live on. The root layout is already `force-dynamic`, so we hydrate
 * wagmi from the request cookie (soulweaver's SSR pattern) to avoid a connect
 * flash on reload.
 */

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || "";

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [mainnet, polygon];

const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId,
  networks,
});

createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata: {
    name: "Museum of Crypto Art",
    description: "Museum of Crypto Art — galleries, exhibitions, and the MOCA Library.",
    url:
      typeof window !== "undefined"
        ? window.location.origin
        : "https://museumofcryptoart.com",
    icons: ["https://museumofcryptoart.com/icons/icon-192.png"],
  },
  themeMode: "dark",
  // Wallet-only connect — no email/social logins.
  features: { analytics: false, email: false, socials: false },
});

export function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  cookies: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const initialState = cookieToInitialState(
    wagmiAdapter.wagmiConfig as Config,
    cookies,
  );

  useEffect(() => {
    reconnect(wagmiAdapter.wagmiConfig as Config);
  }, []);

  return (
    <WagmiProvider
      config={wagmiAdapter.wagmiConfig as Config}
      initialState={initialState}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
