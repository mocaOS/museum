"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppKit } from "@reown/appkit/react";
import { useWallet } from "@/hooks/useWallet";
import { useAuthSession } from "@/hooks/useAuthSession";
import { ReviewTable } from "@/components/library/ReviewTable";

/**
 * Admin-only moderation screen for community document submissions. Gated by the
 * SIWE session (`isAdmin`); the API routes it calls are independently
 * server-guarded, so this gate is UX, not the security boundary.
 */
export default function ReviewPage() {
  const { open } = useAppKit();
  const { isConnected } = useWallet();
  const { isAuthenticated, isAdmin, isLoading, signIn } = useAuthSession();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const doSignIn = async () => {
    setSigningIn(true);
    setSignInError(null);
    try {
      await signIn();
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Top bar */}
      <header
        className="flex h-14 items-center justify-between border-b px-5"
        style={{
          background: "oklch(0.15 0 0 / 0.65)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-center gap-3">
          <Link
            href="/library"
            className="rounded-[var(--radius)] px-2 py-1.5 text-sm transition-colors hover:bg-[var(--muted)]"
            style={{ color: "var(--fg2)" }}
          >
            ← Library
          </Link>
          <span className="text-sm" style={{ color: "var(--fg1)" }}>
            Submissions review
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <div className="mb-6">
          <h1 className="text-2xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
            Submissions review
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
            Approve submissions to publish them into the Cortex{" "}
            <span style={{ color: "var(--fg1)" }}>Collective</span> collection.
          </p>
        </div>

        {isLoading ? (
          <p className="py-16 text-center text-sm" style={{ color: "var(--fg2)" }}>
            Loading…
          </p>
        ) : !isConnected ? (
          <Gate
            message="Connect your wallet to review submissions."
            actionLabel="Connect wallet"
            onAction={() => open()}
          />
        ) : !isAuthenticated ? (
          <Gate
            message="Sign in with your wallet to continue."
            actionLabel={signingIn ? "Sign in wallet…" : "Sign in"}
            onAction={doSignIn}
            busy={signingIn}
            error={signInError}
          />
        ) : !isAdmin ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "var(--fg2)" }}>
              Your address is not on the reviewer whitelist.
            </p>
          </div>
        ) : (
          <ReviewTable />
        )}
      </main>
    </div>
  );
}

function Gate({
  message,
  actionLabel,
  onAction,
  busy,
  error,
}: {
  message: string;
  actionLabel: string;
  onAction: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <p className="text-sm" style={{ color: "var(--fg2)" }}>
        {message}
      </p>
      <button
        type="button"
        onClick={onAction}
        disabled={busy}
        className="rounded-[var(--radius)] px-4 py-2 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50"
        style={{ background: "var(--accent)", color: "oklch(0.2 0 0)" }}
      >
        {actionLabel}
      </button>
      {error && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
