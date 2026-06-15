/**
 * A tiny TTL'd key/value layer for the museum guide's ephemeral hybrid state —
 * per-visitor sessions and the exhibition-level shared insight cache.
 *
 * Default behavior (no Redis): the guide keeps everything in-process, exactly
 * as before — state is lost on restart and not shared across replicas. When
 * `REDIS_ENABLED=true` + `REDIS=<connection>` are set on the Directus
 * deployment, `createRedisKv` returns a small Redis-backed store the guide
 * write-throughs to, so session memory + mined insights survive a redeploy and
 * are shared across instances. Values are JSON; nothing here is a durable
 * record — short TTLs only, same privacy posture as /v1/presence.
 *
 * Adding ioredis as a dependency is harmless when unused (the client is only
 * constructed when both env vars are present); on any connection error the
 * guide silently degrades to its in-process maps.
 */

import IORedis, { type Redis } from "ioredis";

export interface KvStore {
  /** Parsed JSON value, or null when absent / on any error (never throws). */
  get<T>(key: string): Promise<T | null>;
  /** Write a JSON value with a millisecond TTL (best-effort, never throws). */
  set<T>(key: string, value: T, ttlMs: number): Promise<void>;
  /** Delete a key (best-effort, never throws). */
  del(key: string): Promise<void>;
}

/**
 * Build the Redis-backed store, or null when Redis isn't configured (the guide
 * then runs purely in-process). Keys are namespaced under `moca:guide:`.
 */
export function createRedisKv(env: Record<string, any>): KvStore | null {
  const enabled = String(env.REDIS_ENABLED ?? "").toLowerCase() === "true";
  const url = env.REDIS ? String(env.REDIS) : "";
  if (!enabled || !url) return null;

  let client: Redis;
  try {
    client = new IORedis(url, {
      // Fail fast and keep the guide responsive — a flaky Redis must never
      // stall a visitor's reply; on error we just fall back to in-memory.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
  } catch (e: any) {
    console.warn(
      `[moca-guide] REDIS is set but ioredis failed to initialize (${e?.message || e}) — ` +
        "the guide will use its in-process store (state won't survive a restart / span replicas).",
    );
    return null;
  }

  // One warn per error burst, mirroring guide.ts's throttled upstream warnings.
  let warned = false;
  client.on("error", (e: any) => {
    if (!warned) {
      warned = true;
      console.warn(
        `[moca-guide] Redis store error (${e?.message || e}) — degrading to in-memory until it recovers.`,
      );
    }
  });
  client.on("ready", () => {
    warned = false;
  });

  const PFX = "moca:guide:";
  return {
    async get<T>(key: string): Promise<T | null> {
      try {
        const raw = await client.get(PFX + key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
      try {
        await client.set(PFX + key, JSON.stringify(value), "PX", Math.max(1000, Math.floor(ttlMs)));
      } catch {
        /* best-effort */
      }
    },
    async del(key: string): Promise<void> {
      try {
        await client.del(PFX + key);
      } catch {
        /* best-effort */
      }
    },
  };
}
