"use client";

import { useEffect, useState } from "react";
import { useAppKit } from "@reown/appkit/react";
import { useWallet } from "@/hooks/useWallet";
import { useEnsNames } from "@/hooks/useEnsNames";
import { truncateAddress } from "@/lib/web3/format";
import { AccountSheet } from "./AccountSheet";

const WalletIcon = () => (
  <svg
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
  </svg>
);

/**
 * Neutral outline pill (accent stays reserved for the "Enter the Library" CTA
 * that sits beside it). Disconnected → opens the AppKit connect modal; connected
 * → opens our custom account view with the wallet's MOCA holdings.
 */
export function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected, isLoading } = useWallet();
  const ens = useEnsNames(address ? [address] : []);
  const ensName = address ? ens[address] : null;
  const [sheetOpen, setSheetOpen] = useState(false);

  // Wallet state (connected/reconnecting) only exists on the client — wagmi's
  // reconnect() runs after hydration. Render the stable disconnected state on
  // the server and the first client paint so SSR HTML matches, then reveal the
  // live state once mounted. Otherwise the SSR "Login" and the post-reconnect
  // "Connecting…" disagree and React throws a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const base =
    "flex h-9 items-center gap-2 rounded-[var(--radius)] border px-3.5 text-sm font-medium transition-colors hover:bg-[var(--muted)] active:scale-[0.98]";

  if (mounted && isConnected && address) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className={`${base}${ensName ? "" : " font-mono"}`}
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          title={address}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: "var(--success)" }}
            aria-hidden="true"
          />
          {ensName || truncateAddress(address)}
        </button>
        <AccountSheet
          address={address}
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
        />
      </>
    );
  }

  const loading = mounted && isLoading;
  return (
    <button
      type="button"
      onClick={() => open()}
      disabled={loading}
      className={base}
      style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
    >
      <WalletIcon />
      {loading ? "Connecting…" : "Login"}
    </button>
  );
}
