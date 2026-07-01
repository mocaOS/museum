"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@/hooks/useWallet";
import { useAuthSession } from "@/hooks/useAuthSession";
import { SubmitDocumentDialog } from "@/components/library/SubmitDocumentDialog";
import {
  isEligibleToSubmit,
  SUBMIT_REQUIREMENT_TEXT,
} from "@/lib/web3/eligibility";
import type { Holdings } from "@/lib/web3/types";

const PlusIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ReviewIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z" />
  </svg>
);

async function fetchHoldings(address: string): Promise<Holdings> {
  const res = await fetch(`/api/holdings?address=${address}`);
  if (!res.ok) throw new Error("Failed to read holdings");
  return res.json();
}

const PILL =
  "flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-sm font-medium transition-colors active:scale-[0.98]";

/**
 * Library toolbar entry points, shown next to the account button:
 *   - "Submit" (wallets that meet the holdings gate) → the submission dialog.
 *   - "Review" (whitelisted admins) → the moderation table at /library/review.
 * Submit is gated on holdings (≥100 $MOCA, or ≥1 Art DeCC0 / MOCA ROOM); when the
 * wallet doesn't qualify the button is inert and explains why on hover.
 */
export function LibraryContribute() {
  const { address, isConnected } = useWallet();
  const { isAdmin } = useAuthSession();
  const [open, setOpen] = useState(false);

  const { data: holdings, isLoading } = useQuery({
    queryKey: ["holdings", address],
    queryFn: () => fetchHoldings(address as string),
    enabled: isConnected && !!address,
    staleTime: 60_000,
  });

  if (!isConnected) return null;

  const eligible = isEligibleToSubmit(holdings);

  return (
    <>
      {isAdmin && (
        <Link
          href="/library/review"
          className={`${PILL} hover:bg-[var(--muted)]`}
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        >
          <ReviewIcon />
          <span className="hidden sm:inline">Review</span>
        </Link>
      )}

      {eligible ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`${PILL} hover:bg-[var(--muted)]`}
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        >
          <PlusIcon />
          <span className="hidden sm:inline">Submit</span>
        </button>
      ) : (
        // Inert (not natively disabled) so hover still fires and the tooltip shows.
        <div className="group relative">
          <button
            type="button"
            aria-disabled="true"
            onClick={(e) => e.preventDefault()}
            className={`${PILL} cursor-not-allowed opacity-50`}
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          >
            <PlusIcon />
            <span className="hidden sm:inline">Submit</span>
          </button>
          <span
            role="tooltip"
            className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-64 rounded-[var(--radius)] border px-3 py-2 text-xs opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              color: "var(--fg1)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            {isLoading ? "Checking your holdings…" : SUBMIT_REQUIREMENT_TEXT}
          </span>
        </div>
      )}

      <SubmitDocumentDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
