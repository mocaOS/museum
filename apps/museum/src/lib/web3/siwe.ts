import "server-only";
import { recoverMessageAddress } from "viem";
import {
  parseSiweMessage,
  validateSiweMessage,
  verifySiweMessage,
} from "viem/siwe";
import { getPublicClient } from "./chains";
import { MAINNET, POLYGON, type ChainId } from "./assets";

/**
 * Server-side SIWE (EIP-4361) verification.
 *
 * Prefers viem's `verifySiweMessage`, which handles EOAs *and* smart-contract
 * wallets (ERC-1271 / ERC-6492 — Gnosis Safe etc., common among collectors) via
 * an on-chain call on the message's own chain. If that RPC call fails (RPC down,
 * unsupported chain), it falls back to a pure EOA signature recovery so login
 * still works for the common case.
 *
 * Validates the nonce (must match the one we issued) and the domain (must be the
 * request host) before trusting the signature.
 */

function chainClientFor(chainId: number) {
  const supported: ChainId = chainId === POLYGON ? POLYGON : MAINNET;
  return getPublicClient(supported);
}

export interface SiweVerifyParams {
  message: string;
  signature: `0x${string}`;
  /** The nonce we minted for this login. */
  nonce: string;
  /** The request host (e.g. "museumofcryptoart.com"), matched against the message. */
  domain: string;
}

/**
 * Returns the verified, lowercased address on success, or null on any failure
 * (bad signature, nonce/domain mismatch, expired message).
 */
export async function verifySiwe({
  message,
  signature,
  nonce,
  domain,
}: SiweVerifyParams): Promise<string | null> {
  const parsed = parseSiweMessage(message);
  if (!parsed.address) return null;

  // Field-level checks first (nonce, domain, expiry/notBefore) — cheap and
  // independent of the signature scheme.
  const fieldsValid = validateSiweMessage({
    message: parsed,
    nonce,
    domain,
  });
  if (!fieldsValid) return null;

  const address = parsed.address.toLowerCase();

  try {
    const ok = await verifySiweMessage(chainClientFor(parsed.chainId ?? MAINNET), {
      message,
      signature,
      nonce,
      domain,
    });
    if (ok) return address;
    // verifySiweMessage returned false for a well-formed message — could be an
    // EOA the RPC's universal validator rejected; try a pure recover below.
  } catch {
    // RPC unreachable / chain unsupported — fall through to EOA recovery.
  }

  try {
    const recovered = await recoverMessageAddress({ message, signature });
    return recovered.toLowerCase() === address ? address : null;
  } catch {
    return null;
  }
}
