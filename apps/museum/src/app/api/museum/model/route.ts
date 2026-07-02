import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optimizeModel } from "@/lib/museum/model-optimizer";

export const dynamic = "force-dynamic";

/**
 * Hyperfy-safe room-model proxy: fetches a room GLB and returns it with
 * textures recompressed to capped WebP and geometry decoded to plain float32
 * (see `lib/museum/model-optimizer.ts` for why that exact shape). Exhibition
 * exports point `modelUrl` here, so both the browser Spawn dialog and the CLI
 * spawner upload optimized models into worlds without any change on their
 * side — room GLBs are what dominates a world's initial load (5–40 MB each,
 * every visitor downloads every placed room on join).
 *
 * Fails soft: any fetch/parse/encode problem returns the ORIGINAL bytes, so
 * this route is never the reason a spawn breaks.
 */

const querySchema = z.object({
  src: z.string().min(8).max(2048),
  /** Texture edge cap in px. */
  t: z.coerce.number().int().min(256).max(4096).optional(),
  /** Lossy WebP quality for non-normal maps. */
  q: z.coerce.number().int().min(30).max(100).optional(),
});

// Same public-media-only policy as the texture proxy.
const BLOCKED_HOST =
  /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i;

const MAX_INPUT_BYTES = 200 * 1024 * 1024;

function parseAllowedUrl(src: string): URL | null {
  try {
    const u = new URL(src);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (BLOCKED_HOST.test(u.hostname) || u.hostname.endsWith(".local")) return null;
    return u;
  } catch {
    return null;
  }
}

/**
 * Optimizing a 40 MB GLB costs seconds of CPU; spawns fetch the same handful
 * of rooms repeatedly (browser dialog + CLI + re-spawns). Small in-process
 * LRU on top of the edge cache, deduping concurrent requests too.
 */
const CACHE_MAX_BYTES = 256 * 1024 * 1024;
const cache = new Map<string, Promise<{ glb: Buffer; optimized: boolean; inputBytes: number }>>();

function cachePut(key: string, value: Promise<{ glb: Buffer; optimized: boolean; inputBytes: number }>) {
  cache.set(key, value);
  void value
    .then(async () => {
      let total = 0;
      for (const p of cache.values()) total += (await p).glb.byteLength;
      // Evict oldest entries until under budget (insertion order = LRU-ish).
      for (const k of cache.keys()) {
        if (total <= CACHE_MAX_BYTES) break;
        const evicted = await cache.get(k)!;
        cache.delete(k);
        total -= evicted.glb.byteLength;
      }
    })
    .catch(() => cache.delete(key));
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { src, t = 1024, q = 80 } = parsed.data;

  const url = parseAllowedUrl(src);
  if (!url) {
    return NextResponse.json({ error: "Unsupported source" }, { status: 400 });
  }

  const key = `${url.href}|${t}|${q}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url.href, {
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`upstream ${res.status}`);
      const len = Number(res.headers.get("content-length") || 0);
      if (len > MAX_INPUT_BYTES) throw new Error("model too large");
      const input = new Uint8Array(await res.arrayBuffer());
      if (input.byteLength > MAX_INPUT_BYTES) throw new Error("model too large");
      return optimizeModel(input, { textureSize: t, quality: q });
    })();
    cachePut(key, pending);
  }

  let result;
  try {
    result = await pending;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model unavailable" },
      { status: 502 },
    );
  }

  return new NextResponse(new Uint8Array(result.glb), {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      // Room models are immutable per file id — cache hard at the edge.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      // Spawners run cross-origin (browser dialog against any world; CLI).
      "Access-Control-Allow-Origin": "*",
      "X-Moca-Model": result.optimized ? "optimized" : "passthrough",
      "X-Moca-Input-Bytes": String(result.inputBytes),
    },
  });
}
