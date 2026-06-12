import "server-only";
import { unstable_cache } from "next/cache";
import { keccak_256 } from "@noble/hashes/sha3.js";

/**
 * Onchain owner lookup for MOCA ROOMs, with ENS reverse resolution.
 *
 * The ROOMs ERC-721 lives on Ethereum mainnet at
 * 0x87D04ff86CaFee75d572691b31509f72c0088C2B (the contract the rooms subgraph
 * indexes — the same source of truth as the `slots` amounts). We call
 * `ownerOf(tokenId)` via plain JSON-RPC, then resolve the owner's primary ENS
 * name the way docs.ens.domains specifies: reverse-resolve
 * `<addr>.addr.reverse` through the registry, and only trust the name after
 * verifying it forward-resolves back to the same address.
 *
 * Everything fails soft (null) — the room page renders fine without an owner.
 */

const ROOMS_CONTRACT = "0x87D04ff86CaFee75d572691b31509f72c0088C2B";
const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

const SEL_OWNER_OF = "0x6352211e"; // ownerOf(uint256)
const SEL_RESOLVER = "0x0178b8bf"; // resolver(bytes32)
const SEL_NAME = "0x691f3431"; // name(bytes32)
const SEL_ADDR = "0x3b3b57de"; // addr(bytes32)

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

export interface RoomOwner {
  /** Checksummed-ish (lowercase) owner address. */
  address: string;
  /** Verified primary ENS name, if the owner set one. */
  ens: string | null;
}

function rpcUrl(): string {
  return process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com";
}

async function ethCall(to: string, data: string): Promise<string | null> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
    // The route is wrapped in unstable_cache — skip the fetch-level cache.
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { result?: string; error?: unknown };
  if (!json.result || json.result === "0x") return null;
  return json.result;
}

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

/** EIP-137 namehash. */
function namehash(name: string): string {
  let node = new Uint8Array(32);
  if (name) {
    for (const label of name.split(".").reverse()) {
      const labelHash = keccak_256(new TextEncoder().encode(label));
      const joined = new Uint8Array(64);
      joined.set(node);
      joined.set(labelHash, 32);
      node = keccak_256(joined);
    }
  }
  return `0x${hex(node)}`;
}

const pad32 = (hexNoPrefix: string) => hexNoPrefix.padStart(64, "0");

/** Last 20 bytes of a 32-byte ABI word → 0x address (lowercase). */
function wordToAddress(word: string): string | null {
  const clean = word.replace(/^0x/, "");
  if (clean.length !== 64) return null;
  const addr = `0x${clean.slice(24)}`;
  return addr === ZERO_ADDRESS ? null : addr;
}

/** Decode a single ABI-encoded string return value. */
function decodeString(result: string): string | null {
  try {
    const clean = result.replace(/^0x/, "");
    const offset = Number.parseInt(clean.slice(0, 64), 16) * 2;
    const length = Number.parseInt(clean.slice(offset, offset + 64), 16) * 2;
    const data = clean.slice(offset + 64, offset + 64 + length);
    const bytes = new Uint8Array(data.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Number.parseInt(data.slice(i * 2, i * 2 + 2), 16);
    }
    const s = new TextDecoder().decode(bytes);
    return s || null;
  } catch {
    return null;
  }
}

async function resolverFor(node: string): Promise<string | null> {
  const res = await ethCall(ENS_REGISTRY, `${SEL_RESOLVER}${node.replace(/^0x/, "")}`);
  return res ? wordToAddress(res) : null;
}

/** Reverse-resolve an address to its primary ENS name, forward-verified. */
async function lookupEns(address: string): Promise<string | null> {
  const reverseNode = namehash(`${address.toLowerCase().replace(/^0x/, "")}.addr.reverse`);
  const reverseResolver = await resolverFor(reverseNode);
  if (!reverseResolver) return null;
  const nameRes = await ethCall(reverseResolver, `${SEL_NAME}${reverseNode.replace(/^0x/, "")}`);
  const name = nameRes ? decodeString(nameRes) : null;
  if (!name) return null;

  // Forward verification (per ENS docs): the claimed name must resolve back
  // to the same address, or anyone could impersonate any name.
  const forwardNode = namehash(name);
  const forwardResolver = await resolverFor(forwardNode);
  if (!forwardResolver) return null;
  const addrRes = await ethCall(forwardResolver, `${SEL_ADDR}${forwardNode.replace(/^0x/, "")}`);
  const resolved = addrRes ? wordToAddress(addrRes) : null;
  return resolved?.toLowerCase() === address.toLowerCase() ? name : null;
}

/**
 * Owner of a ROOMs token, with verified primary ENS name. Cached for an hour
 * per token (ownership changes rarely; the page revalidates hourly anyway).
 */
export const getRoomOwner = unstable_cache(
  async (tokenId: string): Promise<RoomOwner | null> => {
    try {
      const id = BigInt(tokenId);
      const res = await ethCall(
        ROOMS_CONTRACT,
        `${SEL_OWNER_OF}${pad32(id.toString(16))}`,
      );
      const address = res ? wordToAddress(res) : null;
      if (!address) return null;
      const ens = await lookupEns(address).catch(() => null);
      return { address, ens };
    } catch {
      return null;
    }
  },
  ["museum:room-owner"],
  { revalidate: 3600 },
);
