/**
 * MOCA API key authentication + per-key rate limiting for the public /v1 API.
 *
 * Keys live in the `moca_api_keys` Directus collection (admin-managed; see
 * directus-config/snapshot). Clients send either header:
 *   X-API-Key: moca_…
 *   Authorization: Bearer moca_…
 *
 * Lookups are cached in memory for a minute, and a sliding-window limiter
 * (MOCA_API_RATE_LIMIT requests/minute, default 120) protects the upstream
 * database and the DeCC0s aggregation. Both caches are per-process — fine for
 * the single-node Coolify deploy this API runs on.
 */

type AnyRecord = Record<string, any>;

interface KeyCacheEntry {
  ok: boolean;
  id?: number | string;
  at: number;
}

const KEY_CACHE_TTL_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const TOUCH_THROTTLE_MS = 5 * 60_000;

export function createKeyAuth(ctx: {
  services: AnyRecord;
  getSchema: () => Promise<unknown>;
  env: AnyRecord;
}) {
  const { services, getSchema, env } = ctx;
  const limit = Number(env.MOCA_API_RATE_LIMIT || 120);
  const keyCache = new Map<string, KeyCacheEntry>();
  const windows = new Map<string, number[]>();
  const lastTouched = new Map<string, number>();

  async function keysService() {
    const schema = await getSchema();
    const { ItemsService } = services;
    return new ItemsService("moca_api_keys", { schema });
  }

  async function lookup(key: string): Promise<KeyCacheEntry> {
    const hit = keyCache.get(key);
    if (hit && Date.now() - hit.at < KEY_CACHE_TTL_MS) return hit;
    let entry: KeyCacheEntry = { ok: false, at: Date.now() };
    try {
      const svc = await keysService();
      const rows = await svc.readByQuery({
        filter: { _and: [{ key: { _eq: key } }, { status: { _eq: "active" } }] },
        limit: 1,
        fields: ["id"],
      });
      if (rows.length > 0) entry = { ok: true, id: rows[0].id, at: Date.now() };
    } catch {
      // DB hiccup: treat as invalid but don't cache long — retry next request.
      return { ok: false, at: 0 };
    }
    keyCache.set(key, entry);
    return entry;
  }

  /** Record key usage (at most once per few minutes per key). */
  function touch(key: string, id: number | string | undefined) {
    if (id == null) return;
    const now = Date.now();
    if (now - (lastTouched.get(key) || 0) < TOUCH_THROTTLE_MS) return;
    lastTouched.set(key, now);
    keysService()
      .then((svc) => svc.updateOne(id, { last_used: new Date().toISOString() }))
      .catch(() => {
        /* best-effort */
      });
  }

  return async function apiKeyAuth(req: AnyRecord, res: AnyRecord, next: () => void) {
    const bearer = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "");
    const key = String(req.headers?.["x-api-key"] || bearer || "").trim();

    if (!key) {
      return res.status(401).json({
        errors: [
          {
            message:
              "Missing API key. Send it as 'X-API-Key: <key>' or 'Authorization: Bearer <key>'. Request a key from the MOCA team.",
            extensions: { code: "UNAUTHORIZED" },
          },
        ],
      });
    }

    const entry = await lookup(key);
    if (!entry.ok) {
      return res.status(401).json({
        errors: [
          { message: "Invalid or revoked API key.", extensions: { code: "UNAUTHORIZED" } },
        ],
      });
    }

    // Sliding-window rate limit per key.
    const now = Date.now();
    const hits = (windows.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (hits.length >= limit) {
      res.set("Retry-After", "60");
      return res.status(429).json({
        errors: [
          {
            message: `Rate limit exceeded (${limit} requests/minute).`,
            extensions: { code: "RATE_LIMITED" },
          },
        ],
      });
    }
    hits.push(now);
    windows.set(key, hits);
    res.set("X-RateLimit-Limit", String(limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, limit - hits.length)));

    touch(key, entry.id);
    next();
  };
}
