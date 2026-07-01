import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Web3 session for the Library, built on Sign-In With Ethereum (SIWE).
 *
 * The wallet connection (Reown/wagmi) is client-side and unauthenticated — the
 * browser could claim to be any address. For actions that write to the museum's
 * Cortex knowledge base (document submissions, admin approvals) we need the
 * server to *know* the acting address, so those flows require a SIWE signature.
 * On success we mint a short-lived, HMAC-signed httpOnly cookie carrying the
 * verified address. No database — the cookie is stateless and self-verifying.
 *
 * Requires SESSION_SECRET. When unset, sessions can't be issued or read (the
 * submission/review features are simply disabled — the read-only chat is
 * unaffected).
 */

const SESSION_COOKIE = "moca_library_session";
const NONCE_COOKIE = "moca_library_siwe_nonce";
const SESSION_TTL_SECONDS = 60 * 60 * 24; // 24h
const NONCE_TTL_SECONDS = 60 * 10; // 10m — one login attempt

interface TokenBody {
  exp: number;
  [key: string]: unknown;
}

function secret(): string | null {
  return process.env.SESSION_SECRET || null;
}

/** Compact signed token: base64url(payload).base64url(hmac-sha256). */
export function signToken(
  payload: Record<string, unknown>,
  ttlSeconds: number,
): string | null {
  const s = secret();
  if (!s) return null;
  const body: TokenBody = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = createHmac("sha256", s).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyToken(token: string | undefined | null): TokenBody | null {
  const s = secret();
  if (!s || !token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = createHmac("sha256", s).update(data).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(
      Buffer.from(data, "base64url").toString("utf8"),
    ) as TokenBody;
    if (
      typeof body.exp !== "number" ||
      body.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return body;
  } catch {
    return null;
  }
}

const cookieOpts = (maxAge: number) =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  });

export interface Session {
  /** Lowercased, SIWE-verified address. */
  address: string;
}

/** The verified session for the current request, or null. Read-only-safe. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const body = verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!body || typeof body.address !== "string") return null;
  return { address: body.address.toLowerCase() };
}

export async function setSession(address: string): Promise<boolean> {
  const token = signToken({ address: address.toLowerCase() }, SESSION_TTL_SECONDS);
  if (!token) return false;
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(SESSION_TTL_SECONDS));
  return true;
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Issue a single-use SIWE nonce, stashed in a short-lived signed cookie. */
export async function issueNonce(nonce: string): Promise<boolean> {
  const token = signToken({ nonce }, NONCE_TTL_SECONDS);
  if (!token) return false;
  (await cookies()).set(NONCE_COOKIE, token, cookieOpts(NONCE_TTL_SECONDS));
  return true;
}

/** Read + clear the pending SIWE nonce (single use). */
export async function consumeNonce(): Promise<string | null> {
  const store = await cookies();
  const body = verifyToken(store.get(NONCE_COOKIE)?.value);
  store.delete(NONCE_COOKIE);
  return body && typeof body.nonce === "string" ? body.nonce : null;
}
