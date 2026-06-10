import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { proxiedUrl } from "@/lib/museum/media";

export const dynamic = "force-dynamic";

/**
 * Same-origin image proxy for 3D textures. THREE.TextureLoader needs CORS
 * headers on every hop of a redirect chain, and the transform-in proxy 302s
 * back to the origin host for anything it can't transform (IPFS gateways,
 * revived hosts, odd formats) — whether the texture then loads depends on
 * that host's CORS policy. Streaming the bytes through our own origin makes
 * texture loading deterministic: try the optimizing proxy first (resizes to
 * WebP + revives dead URLs), fall back to fetching the source directly.
 */

const querySchema = z.object({
  src: z.string().min(8).max(2048),
  w: z.coerce.number().int().min(64).max(2048).optional(),
});

// Block obvious SSRF targets — this route only proxies public artwork media.
const BLOCKED_HOST =
  /^(localhost$|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i;

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

async function fetchImage(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { Accept: "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok || !res.body) return null;
    const ct = res.headers.get("content-type") || "";
    // SVG textures need rasterizing client-side anyway and image/* covers it;
    // reject html error pages and other non-image payloads.
    if (!ct.startsWith("image/")) return null;
    return res;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { src, w = 1024 } = parsed.data;

  const url = parseAllowedUrl(src);
  if (!url) {
    return NextResponse.json({ error: "Unsupported source" }, { status: 400 });
  }

  // Optimizing proxy first (WebP resize + dead-host revival), origin second.
  const upstream =
    (await fetchImage(proxiedUrl(url.href, { width: w, format: "webp", q: 82 }))) ??
    (await fetchImage(url.href));

  if (!upstream) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 502 });
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/webp",
      // Artwork media is immutable in practice; cache hard at the edge and
      // in the browser so revisiting an exhibit doesn't refetch every wall.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, immutable",
      // Public image proxy: CORS lets external 3D consumers (e.g. Hyperfy
      // worlds rendering exported exhibitions) use these as GL textures.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
