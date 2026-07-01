"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppKit } from "@reown/appkit/react";
import { Spinner, WalletIcon, RefreshIcon, AlertIcon } from "./icons";
import { useWallet } from "@/hooks/useWallet";
import { formatTokenAmount, truncateAddress } from "@/lib/web3/format";
import {
  polygonscanAddress,
  POLYGON_CHAIN_ID,
  STAKE_TOKENS,
  type StakePosition,
  type StakesResponse,
  type StakeTokenKey,
} from "@/lib/web3/staking";
import { WithdrawButton } from "./WithdrawButton";

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

// Order token groups the way we list them on the page.
const TOKEN_ORDER: StakeTokenKey[] = ["MOCA", "MOCA_USDC_LP", "MOCA_WETH_LP"];

async function fetchStakes(address: string): Promise<StakesResponse> {
  const res = await fetch(`/api/stakes?address=${address}`);
  if (!res.ok) throw new Error("Failed to read staking positions");
  return res.json();
}

export function StakeManager() {
  const { address, isConnected, chainId } = useWallet();
  const { open } = useAppKit();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["stakes", address],
    queryFn: () => fetchStakes(address as string),
    enabled: isConnected && !!address,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const groups = new Map<StakeTokenKey, StakePosition[]>();
    for (const p of data?.positions ?? []) {
      const list = groups.get(p.token) ?? [];
      list.push(p);
      groups.set(p.token, list);
    }
    return groups;
  }, [data]);

  if (!isConnected || !address) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full border"
            style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
          >
            <WalletIcon size={22} />
          </div>
          <p className="max-w-sm text-sm" style={{ color: "var(--fg2)" }}>
            Connect the wallet you staked with to see your positions and withdraw.
          </p>
          <button
            type="button"
            onClick={() => open()}
            className="flex h-10 items-center gap-2 rounded-[var(--radius)] px-4 text-sm font-medium transition-transform active:scale-[0.98]"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            <WalletIcon size={16} />
            Connect wallet
          </button>
        </div>
      </Panel>
    );
  }

  const wrongNetwork = chainId !== undefined && chainId !== POLYGON_CHAIN_ID;
  const positions = data?.positions ?? [];

  return (
    <div className="flex flex-col gap-4">
      {wrongNetwork && (
        <div
          className="flex items-start gap-3 rounded-[var(--radius)] border px-4 py-3 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--fg2)" }}
        >
          <span className="shrink-0" style={{ color: "var(--warning)" }}>
            <AlertIcon size={18} />
          </span>
          <span>
            These pools live on Polygon. You can review your positions now — each
            Withdraw button will prompt you to switch networks before sending.
          </span>
        </div>
      )}

      {isLoading && (
        <Panel>
          <p className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: "var(--fg2)" }}>
            <Spinner size={16} />
            Reading your positions on Polygon…
          </p>
        </Panel>
      )}

      {isError && (
        <Panel>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm" style={{ color: "var(--fg2)" }}>
              Couldn&rsquo;t read staking positions — the Polygon RPC may be busy.
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="flex h-9 items-center gap-2 rounded-[var(--radius)] border px-3.5 text-sm transition-colors hover:bg-[var(--muted)]"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              <RefreshIcon size={15} />
              Retry
            </button>
          </div>
        </Panel>
      )}

      {data && positions.length === 0 && (
        <Panel>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm" style={{ color: "var(--fg1)" }}>
              No stake found for this wallet.
            </p>
            <p className="max-w-md text-sm" style={{ color: "var(--fg2)" }}>
              We checked all 12 legacy MOCA pools on Polygon and this address has
              nothing staked. If you staked with a different wallet, connect that
              one instead.
            </p>
          </div>
        </Panel>
      )}

      {data && positions.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--fg2)" }}>
              {positions.length} {positions.length === 1 ? "position" : "positions"} found
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex h-8 items-center gap-1.5 rounded-[var(--radius)] px-2.5 text-xs transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
              style={{ color: "var(--fg2)" }}
            >
              <RefreshIcon size={14} className={isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {TOKEN_ORDER.filter((t) => grouped.has(t)).map((tokenKey) => {
            const meta = STAKE_TOKENS[tokenKey];
            const list = grouped.get(tokenKey) ?? [];
            return (
              <section key={tokenKey} className="flex flex-col gap-2">
                <h2
                  className="text-[11px] uppercase tracking-[0.08em]"
                  style={{ color: "var(--fg2)" }}
                >
                  {meta.label}
                </h2>
                {list.map((p) => (
                  <PositionCard key={p.pool} position={p} onWithdrawn={refetch} />
                ))}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function PositionCard({
  position,
  onWithdrawn,
}: {
  position: StakePosition;
  onWithdrawn: () => void;
}) {
  const isLp = STAKE_TOKENS[position.token].kind === "lp";
  const stakedDisplay = formatTokenAmount(position.stakedFormatted, isLp ? 6 : 2);
  const hasReward = Number(position.earnedFormatted) > 0;

  return (
    <div
      className="flex flex-col gap-4 rounded-[var(--radius)] border p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xl" style={{ fontFamily: MONO, color: "var(--fg1)", letterSpacing: "-0.01em" }}>
            {stakedDisplay}
          </span>
          <span className="text-sm" style={{ color: "var(--fg2)" }}>
            {position.tokenSymbol}
          </span>
        </div>
        {hasReward && (
          <span className="text-xs" style={{ color: "var(--fg2)" }}>
            + {formatTokenAmount(position.earnedFormatted, 4)} $MOCA rewards
          </span>
        )}
        <a
          href={polygonscanAddress(position.pool)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-[11px] transition-colors hover:text-[var(--fg1)]"
          style={{ fontFamily: MONO, color: "var(--fg3)" }}
        >
          <span
            className="rounded-[var(--radius-sm)] border px-1.5 py-0.5"
            style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
          >
            {position.vintage}
          </span>
          {truncateAddress(position.pool, 8, 6)}
        </a>
      </div>

      <div className="sm:flex-shrink-0">
        <WithdrawButton position={position} onWithdrawn={onWithdrawn} />
      </div>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[var(--radius)] border p-5"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      {children}
    </div>
  );
}
