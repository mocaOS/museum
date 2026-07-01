import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifySiwe } from "@/lib/web3/siwe";
import { consumeNonce, setSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Invalid signature"),
});

/**
 * Step 2 of SIWE login: verify the signed message against the nonce we issued
 * and the request host, then mint the session cookie. The verified address is
 * the one recovered from the signature — never trusted from client input.
 */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const expectedNonce = await consumeNonce();
  if (!expectedNonce) {
    return NextResponse.json(
      { error: "Sign-in request expired — please try again" },
      { status: 401 },
    );
  }

  // The browser signs over `window.location.host`; match it against the host
  // it actually reached us on (preserved by the proxy).
  const domain = req.headers.get("host") ?? "";

  const address = await verifySiwe({
    message: parsed.data.message,
    signature: parsed.data.signature as `0x${string}`,
    nonce: expectedNonce,
    domain,
  });
  if (!address) {
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 },
    );
  }

  const ok = await setSession(address);
  if (!ok) {
    return NextResponse.json(
      { error: "Sign-in is not configured" },
      { status: 503 },
    );
  }

  return NextResponse.json({ address, isAdmin: isLibraryAdmin(address) });
}
