import { NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { issueNonce } from "@/lib/web3/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Step 1 of SIWE login: mint a single-use nonce and stash it in a short-lived
 * signed cookie. The client folds it into the message it asks the wallet to sign.
 */
export async function POST() {
  const nonce = generateSiweNonce();
  const ok = await issueNonce(nonce);
  if (!ok) {
    return NextResponse.json(
      { error: "Sign-in is not configured" },
      { status: 503 },
    );
  }
  return NextResponse.json({ nonce });
}
