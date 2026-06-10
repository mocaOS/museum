/**
 * Soulweaver integration for the public /v1 API — agent souls for web3.
 *
 * Soulweaver (the platform behind the Art DeCC0s codex) turns NFTs into
 * agents: per-token SOUL.md identity documents, keccak256-hashed, EIP-191
 * signed by the platform key, pinned to IPFS, addressed by
 * chainId/contractAddress/tokenId. That coordinate scheme plus the signature
 * block makes souls directly consumable by ERC-8004 (Trustless Agents)
 * registrations, ERC-8257 (Agent Tool Registry) manifests, and ERC-8183
 * (Agentic Commerce) job descriptions.
 *
 * The MOCA API proxies Soulweaver's public souls surface so web3 integrators
 * use one key and one base URL. Env:
 * - SOULWEAVER_API_URL — origin of the Soulweaver deployment. Defaults to
 *   https://soulweaver.museumofcryptoart.com (the public open-source
 *   deployment); override for self-hosted or internal instances.
 * - SOULWEAVER_API_HEADERS — optional "Header: value" pairs (newline- or
 *   "||"-separated) forwarded upstream.
 */

const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 300;
const UPSTREAM_TIMEOUT_MS = 20_000;

const cache = new Map<string, { at: number; status: number; body: any }>();

function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\n|\|\|/)) {
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

export function createSoulsClient(env: Record<string, any>) {
  const base = String(
    env.SOULWEAVER_API_URL || "https://soulweaver.museumofcryptoart.com"
  ).replace(/\/$/, "");
  const extraHeaders = parseHeaders(String(env.SOULWEAVER_API_HEADERS || ""));

  async function upstream(path: string): Promise<{ status: number; body: any }> {
    const url = `${base}${path}`;
    const hit = cache.get(url);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;

    const res = await fetch(url, {
      headers: { Accept: "application/json", ...extraHeaders },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: "manual", // an auth-gate 302 must read as misconfig, not data
    });
    const body =
      res.status >= 300 && res.status < 400
        ? null
        : await res.json().catch(() => null);
    const entry = { at: Date.now(), status: res.status, body };
    if (res.ok && body) {
      if (cache.size >= CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(url, entry);
    }
    return entry;
  }

  return {
    configured: !!base,

    /** Paginated souls of a collection. */
    async list(
      chainId: number,
      contractAddress: string,
      page: number,
      limit: number
    ): Promise<{ status: number; body: any }> {
      return upstream(
        `/api/souls/${chainId}/${contractAddress.toLowerCase()}?page=${page}&limit=${limit}`
      );
    },

    /** Latest SOUL file for one token, including the EIP-191 verification block. */
    async one(
      chainId: number,
      contractAddress: string,
      tokenId: string
    ): Promise<{ status: number; body: any }> {
      return upstream(
        `/api/souls/${chainId}/${contractAddress.toLowerCase()}/${encodeURIComponent(tokenId)}`
      );
    },
  };
}
