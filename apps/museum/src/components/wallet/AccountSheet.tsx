"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useDisconnect } from "@reown/appkit/react";
import { truncateAddress, formatTokenAmount } from "@/lib/web3/format";
import type { Holdings, CollectionHoldings } from "@/lib/web3/types";

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const CloseIcon = () => (
  <svg
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const CopyIcon = () => (
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
    <rect width="14" height="14" x="8" y="8" rx="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

async function fetchHoldings(address: string): Promise<Holdings> {
  const res = await fetch(`/api/holdings?address=${address}`);
  if (!res.ok) throw new Error("Failed to read holdings");
  return res.json();
}

export function AccountSheet({
  address,
  open,
  onClose,
}: {
  address: string;
  open: boolean;
  onClose: () => void;
}) {
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["holdings", address],
    queryFn: () => fetchHoldings(address),
    enabled: open && !!address,
    staleTime: 60_000,
  });

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard blocked — no-op */
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    onClose();
  };

  // Portal to <body>: the connect button lives inside a header with
  // backdrop-filter, which would otherwise become the containing block for this
  // position:fixed overlay and clip it to the header's height.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Wallet account"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: "oklch(0 0 0 / 0.6)" }}
      />

      {/* Panel */}
      <aside
        className="relative flex h-full w-full max-w-[380px] flex-col overflow-y-auto border-l p-5"
        style={{
          background: "var(--popover)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        <div className="mb-5 flex items-center justify-between">
          <span
            className="text-[11px] uppercase tracking-[0.08em]"
            style={{ color: "var(--fg2)" }}
          >
            Account
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-[var(--muted)]"
            style={{ color: "var(--fg2)" }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Address */}
        <div
          className="mb-4 flex items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2.5"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <span style={{ fontFamily: MONO, color: "var(--fg1)" }} className="text-sm">
            {truncateAddress(address, 10, 8)}
          </span>
          <button
            type="button"
            onClick={copyAddress}
            aria-label="Copy address"
            className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] px-2 text-xs transition-colors hover:bg-[var(--muted)]"
            style={{ color: "var(--fg2)" }}
          >
            <CopyIcon />
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {isLoading && (
          <p className="py-8 text-center text-sm" style={{ color: "var(--fg2)" }}>
            Reading holdings…
          </p>
        )}

        {isError && (
          <div className="py-8 text-center">
            <p className="mb-3 text-sm" style={{ color: "var(--fg2)" }}>
              Couldn&rsquo;t read on-chain holdings.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-[var(--radius)] border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--muted)]"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-5">
            <MocaCard moca={data.moca} />
            <CollectionsTabs collections={data.collections} />
          </div>
        )}

        <div className="mt-auto pt-6">
          <button
            type="button"
            onClick={handleDisconnect}
            className="w-full rounded-[var(--radius)] border py-2.5 text-sm font-medium transition-colors hover:bg-[var(--muted)]"
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          >
            Disconnect
          </button>
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function MocaCard({ moca }: { moca: Holdings["moca"] }) {
  return (
    <section
      className="rounded-[var(--radius)] border p-4"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div
        className="mb-1 text-[11px] uppercase tracking-[0.08em]"
        style={{ color: "var(--fg2)" }}
      >
        ${moca.symbol}
      </div>
      <div
        className="mb-3 text-2xl"
        style={{ fontFamily: MONO, color: "var(--fg1)", letterSpacing: "-0.01em" }}
      >
        {formatTokenAmount(moca.total)}
      </div>
      <div className="flex flex-col gap-1.5">
        <BalanceRow label="Ethereum" value={formatTokenAmount(moca.ethereum)} />
        <BalanceRow label="Polygon" value={formatTokenAmount(moca.polygon)} />
      </div>
    </section>
  );
}

function BalanceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: "var(--fg2)" }}>{label}</span>
      <span style={{ fontFamily: MONO, color: "var(--fg1)" }}>{value}</span>
    </div>
  );
}

function CollectionsTabs({
  collections,
}: {
  collections: CollectionHoldings[];
}) {
  // Default to the first collection that actually has NFTs (falls back to 0).
  const firstNonEmpty = collections.findIndex((c) => c.items.length > 0);
  const [active, setActive] = useState(firstNonEmpty === -1 ? 0 : firstNonEmpty);

  const current = collections[active];
  if (!current) return null;

  return (
    <section>
      {/* Tab bar */}
      <div
        className="mb-3 flex items-center gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        {collections.map((c, i) => {
          const on = i === active;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setActive(i)}
              className="relative -mb-px flex items-center gap-1.5 px-3 py-2 text-sm transition-colors"
              style={{ color: on ? "var(--fg1)" : "var(--fg2)" }}
            >
              {c.label}
              <span
                className="text-[11px]"
                style={{
                  fontFamily: MONO,
                  color: on ? "var(--fg2)" : "var(--fg3)",
                }}
              >
                ({c.items.length})
              </span>
              {on && (
                <span
                  className="absolute inset-x-2 -bottom-px h-px"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Active collection grid */}
      {current.items.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--fg3)" }}>
          None held
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {current.items.map((item) => (
            <NftThumb
              key={`${item.contract}:${item.tokenId}`}
              imageUrl={item.imageUrl}
              tokenId={item.tokenId}
              name={item.name}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function NftThumb({
  imageUrl,
  tokenId,
  name,
}: {
  imageUrl: string | null;
  tokenId: string;
  name: string | null;
}) {
  const [broken, setBroken] = useState(false);
  const label = name || `#${tokenId}`;
  return (
    <div
      className="overflow-hidden rounded-[var(--radius-sm)] border"
      style={{ borderColor: "var(--border)", background: "var(--muted)" }}
      title={label}
    >
      <div className="relative aspect-square w-full">
        {imageUrl && !broken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={label}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setBroken(true)}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-[11px]"
            style={{ fontFamily: MONO, color: "var(--fg3)" }}
          >
            #{tokenId}
          </div>
        )}
      </div>
    </div>
  );
}
