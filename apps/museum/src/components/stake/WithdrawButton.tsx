"use client";

import { useEffect } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from "wagmi";
import { Spinner, DownloadIcon, ExternalLinkIcon, CheckIcon } from "./icons";
import { useWallet } from "@/hooks/useWallet";
import {
  STAKING_ABI,
  POLYGON_CHAIN_ID,
  polygonscanTx,
  type StakePosition,
} from "@/lib/web3/staking";

/**
 * One pool's withdraw action. The happy path sends `exit()` — principal + any
 * leftover $MOCA rewards in a single transaction the user signs and pays gas
 * for. If a pool's reward period were somehow still open (`getReward()` would
 * revert inside `exit()`), we fall back to `withdraw(fullBalance)` so principal
 * recovery never gets blocked.
 *
 * If the wallet isn't on Polygon, the button first offers to switch networks.
 */
export function WithdrawButton({
  position,
  onWithdrawn,
}: {
  position: StakePosition;
  onWithdrawn: () => void;
}) {
  const { chainId } = useWallet();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const {
    writeContract,
    data: hash,
    isPending: isSigning,
    error: writeError,
    reset,
  } = useWriteContract();
  const {
    isLoading: isConfirming,
    isSuccess,
  } = useWaitForTransactionReceipt({ hash, chainId: POLYGON_CHAIN_ID });

  const onPolygon = chainId === POLYGON_CHAIN_ID;

  // Refetch positions once the withdrawal confirms.
  useEffect(() => {
    if (isSuccess) onWithdrawn();
  }, [isSuccess, onWithdrawn]);

  const withdraw = () => {
    reset();
    if (position.periodFinished) {
      writeContract({
        address: position.pool,
        abi: STAKING_ABI,
        functionName: "exit",
        chainId: POLYGON_CHAIN_ID,
      });
    } else {
      // Principal only — never blocked by an open reward period.
      writeContract({
        address: position.pool,
        abi: STAKING_ABI,
        functionName: "withdraw",
        args: [BigInt(position.staked)],
        chainId: POLYGON_CHAIN_ID,
      });
    }
  };

  const btnBase =
    "flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-medium transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

  if (isSuccess) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span
          className="flex h-10 items-center gap-2 rounded-[var(--radius)] px-4 text-sm font-medium"
          style={{ background: "var(--success)", color: "var(--success-fg)" }}
        >
          <CheckIcon size={16} />
          Withdrawn
        </span>
        {hash && <TxLink hash={hash} />}
      </div>
    );
  }

  if (!onPolygon) {
    return (
      <button
        type="button"
        onClick={() => switchChain({ chainId: POLYGON_CHAIN_ID })}
        disabled={isSwitching}
        className={`${btnBase} border`}
        style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
      >
        {isSwitching ? <Spinner size={16} /> : null}
        Switch to Polygon
      </button>
    );
  }

  const busy = isSigning || isConfirming;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={withdraw}
        disabled={busy}
        className={btnBase}
        style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
      >
        {busy ? <Spinner size={16} /> : <DownloadIcon size={16} />}
        {isSigning
          ? "Confirm in wallet…"
          : isConfirming
            ? "Withdrawing…"
            : "Withdraw"}
      </button>
      {hash && <TxLink hash={hash} />}
      {writeError && (
        <span className="max-w-[220px] text-right text-xs" style={{ color: "var(--destructive)" }}>
          {friendlyError(writeError)}
        </span>
      )}
    </div>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={polygonscanTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1 text-xs transition-colors hover:text-[var(--fg1)]"
      style={{ color: "var(--fg2)", fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}
    >
      View transaction
      <ExternalLinkIcon size={12} />
    </a>
  );
}

/** Turn viem/wagmi errors into one short human line. */
function friendlyError(error: Error): string {
  const msg = error.message || "";
  if (/user rejected|denied|rejected the request/i.test(msg)) {
    return "Transaction rejected.";
  }
  if (/insufficient funds/i.test(msg)) {
    return "Not enough POL for gas.";
  }
  // viem attaches a short summary line on most contract errors.
  const short = (error as { shortMessage?: string }).shortMessage;
  return short || "Transaction failed — try again.";
}
