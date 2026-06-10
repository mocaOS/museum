/**
 * Art DeCC0s (MOCA Codex) aggregation for the public /v1 API.
 *
 * The DeCC0s knowledge base lives on its own Directus instance
 * (https://api.decc0s.com, documented at https://docs.decc0s.com). The MOCA
 * API aggregates it so integrators hit one surface with one key:
 *
 * - thumbnails are resolved to absolute /assets URLs
 * - the heavyweight blobs (agent_profiles, moltbot) are excluded unless
 *   explicitly requested via ?include=profiles
 * - responses are cached in memory (5 min TTL) to be a good upstream citizen
 */

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_MAX = 500;
const UPSTREAM_TIMEOUT_MS = 20_000;

/** Lightweight default field set for list views. */
export const DECC0_LIST_FIELDS = [
  "id",
  "name",
  "description",
  "ancestor",
  "decc0_type",
  "dna1",
  "dna2",
  "dna3",
  "dna4",
  "cultural_affiliation",
  "philosophical_affiliation",
  "artstyle_loved",
  "owner",
  "soul",
  "multiplicity",
  "thumbnail",
  "thumbnail_character",
  "thumbnail_background",
  "ipfs_final",
  "timestamp_created",
] as const;

/** Everything except the multi-hundred-KB blobs. */
const HEAVY_FIELDS = ["agent_profiles", "moltbot"];

const cache = new Map<string, { at: number; status: number; body: any }>();

function cacheGet(key: string) {
  const hit = cache.get(key);
  if (!hit || Date.now() - hit.at > CACHE_TTL_MS) return null;
  return hit;
}

function cacheSet(key: string, status: number, body: any) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), status, body });
}

export function createDecc0sClient(env: Record<string, any>) {
  const base = String(env.DECC0S_API_URL || "https://api.decc0s.com").replace(/\/$/, "");

  async function upstream(path: string): Promise<{ status: number; body: any }> {
    const url = `${base}${path}`;
    const hit = cacheGet(url);
    if (hit) return hit;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => null);
    if (res.ok && body) cacheSet(url, res.status, body);
    return { status: res.status, body };
  }

  /** Map Directus file UUIDs onto absolute asset URLs integrators can use. */
  function withAssetUrls<T extends Record<string, any>>(item: T): T {
    const out: Record<string, any> = { ...item };
    for (const field of ["thumbnail", "thumbnail_character", "thumbnail_background"]) {
      if (typeof out[field] === "string" && out[field]) {
        out[`${field}_url`] = `${base}/assets/${out[field]}`;
      }
    }
    if (typeof out.ipfs_final === "string" && out.ipfs_final) {
      out.image_ipfs_url = `ipfs://${out.ipfs_final}`;
    }
    return out as T;
  }

  return {
    base,

    async list(opts: {
      page: number;
      limit: number;
      search?: string;
      fields?: string[];
    }): Promise<{ status: number; data?: any[]; meta?: any; error?: string }> {
      const params = new URLSearchParams();
      const fields = opts.fields?.length
        ? opts.fields.filter((f) => !HEAVY_FIELDS.includes(f))
        : [...DECC0_LIST_FIELDS];
      params.set("fields", fields.join(","));
      params.set("limit", String(opts.limit));
      params.set("offset", String((opts.page - 1) * opts.limit));
      params.set("meta", "filter_count,total_count");
      params.set("sort", "id");
      if (opts.search?.trim()) params.set("search", opts.search.trim());

      const { status, body } = await upstream(`/items/codex?${params.toString()}`);
      if (status !== 200 || !body?.data) {
        return { status: 502, error: "DeCC0s upstream unavailable" };
      }
      return {
        status: 200,
        data: (body.data as any[]).map(withAssetUrls),
        meta: {
          total: body.meta?.total_count ?? null,
          filtered: body.meta?.filter_count ?? null,
          page: opts.page,
          limit: opts.limit,
        },
      };
    },

    async one(
      id: number,
      includeProfiles: boolean
    ): Promise<{ status: number; data?: any; error?: string }> {
      const params = new URLSearchParams();
      if (!includeProfiles) {
        // All fields minus the heavyweight blobs.
        params.set("fields", "*");
      }
      const { status, body } = await upstream(`/items/codex/${id}?${params.toString()}`);
      // Directus answers 403 (not 404) for unknown ids on public reads, to
      // avoid existence leaks — for our public dataset both mean "not there".
      if (status === 404 || status === 403) {
        return { status: 404, error: `No DeCC0 with id ${id}` };
      }
      if (status !== 200 || !body?.data) {
        return { status: 502, error: "DeCC0s upstream unavailable" };
      }
      const item = withAssetUrls(body.data);
      if (!includeProfiles) {
        for (const f of HEAVY_FIELDS) delete item[f];
      }
      return { status: 200, data: item };
    },
  };
}
