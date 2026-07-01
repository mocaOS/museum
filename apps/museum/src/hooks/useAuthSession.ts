"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";
import { createSiweMessage } from "viem/siwe";

/**
 * The SIWE session layer on top of the wallet connection.
 *
 * `useWallet()` tells you a wallet is *connected*; this tells you the server has
 * *verified* it via a signature. `signIn()` runs the nonce → sign → verify
 * handshake; the resulting httpOnly session cookie is what the submission and
 * review APIs trust. The session is only treated as authenticated while the same
 * wallet stays connected, so switching accounts requires a fresh sign-in.
 */

interface SessionData {
  address?: string;
  isAdmin?: boolean;
}

async function fetchSession(): Promise<SessionData> {
  const res = await fetch("/api/auth/session", { cache: "no-store" });
  if (!res.ok) return {};
  return res.json();
}

export function useAuthSession() {
  const qc = useQueryClient();
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const { data, isLoading } = useQuery({
    queryKey: ["auth-session"],
    queryFn: fetchSession,
    staleTime: 30_000,
  });

  const sessionAddress = data?.address?.toLowerCase();
  const isAuthenticated =
    !!sessionAddress &&
    !!address &&
    sessionAddress === address.toLowerCase();
  const isAdmin = isAuthenticated && !!data?.isAdmin;

  const signIn = useCallback(async () => {
    if (!address) throw new Error("Connect a wallet first");

    const nonceRes = await fetch("/api/auth/nonce", { method: "POST" });
    if (!nonceRes.ok) throw new Error("Sign-in is unavailable right now");
    const { nonce } = (await nonceRes.json()) as { nonce: string };

    const message = createSiweMessage({
      domain: window.location.host,
      address,
      statement:
        "Sign in to submit and review documents for the MOCA Library.",
      uri: window.location.origin,
      version: "1",
      chainId: chainId ?? 1,
      nonce,
    });

    const signature = await signMessageAsync({ message });

    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      const err = (await verifyRes.json().catch(() => ({}))) as {
        error?: string;
      };
      throw new Error(err.error || "Sign-in failed");
    }

    await qc.invalidateQueries({ queryKey: ["auth-session"] });
  }, [address, chainId, signMessageAsync, qc]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["auth-session"] });
  }, [qc]);

  return {
    address: address?.toLowerCase(),
    isAuthenticated,
    isAdmin,
    isLoading,
    signIn,
    signOut,
  };
}
