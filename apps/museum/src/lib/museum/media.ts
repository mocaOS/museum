// Media model shared by NFTs and rooms. The Directus `media_info` /
// `display_media_info` / `display_animation_info` columns are JSON blobs with
// this shape (mirrors the legacy Nuxt MOCAMedia component).

export interface MediaInfo {
  type?: "image" | "video" | "model" | "svg" | "text" | string;
  content_type?: string;
  url?: string;
  mtl?: string;
  width?: number;
  height?: number;
  alt?: string;
}

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
  process.env.IPFS_GATEWAY ||
  "https://ipfs.qwellcode.de/ipfs/";

/** Resolve ipfs:// URIs to the configured gateway; pass through http(s)/data. */
export function resolveMediaUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return IPFS_GATEWAY + url.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  return url;
}

// --- Media proxy (transform-in) ---------------------------------------------
// Many source URLs (notably openseauserdata.com, now shut down) are dead at the
// origin but cached by the transform-in proxy the legacy app used. Routing
// images/videos through it both revives dead media and optimizes/resizes it.
const TI_BASE = "https://api.transform.in.net/transformation";
const TI_PROJECT =
  process.env.NEXT_PUBLIC_TRANSFORM_PROJECT || "512a5333-37b0-4cb9-9c28-847676421c39";
const TI_KEY =
  process.env.NEXT_PUBLIC_TRANSFORM_KEY || "5e2546a8-831a-4b8e-ae12-3f2ec119b76e";

function b64url(s: string): string {
  const b =
    typeof btoa !== "undefined"
      ? btoa(unescape(encodeURIComponent(s)))
      : Buffer.from(s, "utf8").toString("base64");
  return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface ProxyMods {
  width?: number;
  height?: number;
  fit?: string;
  format?: "webp" | "mp4" | "jpg" | "png";
  q?: number;
}

/** Build a transform-in proxy URL for a remote image/video source. */
export function proxiedUrl(src: string, mods: ProxyMods = {}): string {
  if (!src || src.startsWith("data:") || src.startsWith("/")) return src;
  const clean = src.split("?")[0];
  const ops = Object.entries(mods)
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
  return `${TI_BASE}/${TI_PROJECT}/${TI_KEY}/${b64url(clean)}/${ops || "q:80"}`;
}

export type MediaKind =
  | "image"
  | "gif"
  | "video"
  | "model"
  | "svg"
  | "iframe"
  | "raw"
  | "unsupported";

export function mediaKind(m?: MediaInfo | null): MediaKind {
  if (!m) return "unsupported";
  const ct = m.content_type || "";
  const url = m.url || "";
  if (m.type === "model") return "model";
  if (m.type === "video") return "video";
  if (m.type === "image" && ct.includes("gif")) return "gif";
  if (m.type === "svg" || ct.includes("svg") || (url.endsWith("svg") && !url.includes("youtu")))
    return "svg";
  if (m.type === "text" && ct === "text/html") return "iframe";
  if (url.startsWith("data:")) return "raw";
  if (m.type === "image") return "image";
  return "unsupported";
}

// Hosts whose media has gone dead at origin. openseauserdata.com (OpenSea's old
// user-content host) was shut down, so any blob still pointing there 404s — and
// the transform-in proxy just redirects back to it. When we hit one of these we
// revive the work from the live OpenSea CDN (seadn.io) URL in response_opensea.
const DEAD_MEDIA_HOSTS = ["openseauserdata.com"];

function isDeadMediaUrl(url?: string): boolean {
  return !!url && DEAD_MEDIA_HOSTS.some((host) => url.includes(host));
}

interface OpenseaMediaUrls {
  display_animation_url?: string;
  animation_url?: string;
  display_image_url?: string;
  image_url?: string;
}

/** A live OpenSea CDN URL from the raw response, preferring motion or still. */
function openseaLiveUrl(responseOpensea: unknown, preferStill: boolean): string | undefined {
  const o = responseOpensea as OpenseaMediaUrls | null;
  if (!o) return undefined;
  const order = preferStill
    ? [o.display_image_url, o.image_url, o.display_animation_url, o.animation_url]
    : [o.display_animation_url, o.animation_url, o.display_image_url, o.image_url];
  return order.find((u) => u && !isDeadMediaUrl(u)) || undefined;
}

/** Swap a dead media URL for a live OpenSea CDN fallback when one exists. */
export function reviveMedia(media: MediaInfo | null, responseOpensea: unknown): MediaInfo | null {
  if (!media || !isDeadMediaUrl(media.url)) return media;
  const live = openseaLiveUrl(responseOpensea, mediaKind(media) !== "video");
  return live ? { ...media, url: live } : media;
}

/**
 * Pick the best media blob for display, preferring an animated/video variant,
 * then the optimized display variant, then the raw original. Dead source URLs
 * are revived from response_opensea where possible.
 */
export function pickDisplayMedia(nft: {
  display_animation_info?: unknown;
  display_media_info?: unknown;
  media_info?: unknown;
  response_opensea?: unknown;
}): MediaInfo | null {
  const media =
    (nft.display_animation_info as MediaInfo) ||
    (nft.display_media_info as MediaInfo) ||
    (nft.media_info as MediaInfo) ||
    null;
  return reviveMedia(media, nft.response_opensea);
}

/**
 * Pick the best STILL preview image for a work. Video/animated pieces keep their
 * clip in `display_animation_info` while a poster still lives in
 * `display_media_info` / `media_info` — so overview cards can show a lightweight
 * image instead of autoplaying a multi-megabyte video. Returns null when every
 * variant is motion media (some works have video in all three slots), letting
 * callers fall back to `pickDisplayMedia`.
 */
export function pickPreviewMedia(nft: {
  display_media_info?: unknown;
  media_info?: unknown;
  response_opensea?: unknown;
}): MediaInfo | null {
  for (const candidate of [nft.display_media_info, nft.media_info]) {
    const media = (candidate as MediaInfo) || null;
    if (!media) continue;
    const kind = mediaKind(media);
    if (kind === "image" || kind === "svg" || kind === "raw") {
      return reviveMedia(media, nft.response_opensea);
    }
  }
  return null;
}

/**
 * Lightweight, client-safe view of an NFT. Media is resolved (and dead URLs
 * revived) server-side, so the heavy `response_opensea` blob and the three raw
 * media columns stay on the server — the browser only receives the two small
 * MediaInfo objects it actually renders.
 */
export interface NftView {
  id: number;
  name?: string | null;
  artist_name?: string | null;
  /** Still poster for grid cards (falls back to `display` when none). */
  preview: MediaInfo | null;
  /** Full media (animation/video preferred) for the lightbox. */
  display: MediaInfo | null;
  isVideo: boolean;
  /**
   * Aspect ratio (width / height) of the work, when the source media carries
   * intrinsic dimensions. Defaults to 1 (square) when unknown. Consumed by the
   * 3D exhibition builder to size wall frames portrait-vs-landscape.
   */
  ratio: number;
}

/** Intrinsic aspect ratio (w/h) from the best dimensioned media, else 1. */
export function mediaRatio(...candidates: (MediaInfo | null | undefined)[]): number {
  for (const m of candidates) {
    if (m?.width && m?.height && m.width > 0 && m.height > 0) {
      return m.width / m.height;
    }
  }
  return 1;
}

/**
 * A still, raster texture URL for rendering a work onto a 3D plane. Prefers the
 * image preview; routes through the transform-in proxy (revives dead URLs +
 * sizes to a power-of-two-ish WebP). Returns "" when no still image exists
 * (e.g. video-only works) so callers can show a placeholder.
 */
export function artworkTextureUrl(view: NftView, size = 1024): string {
  const still =
    view.preview && mediaKind(view.preview) !== "video"
      ? view.preview
      : view.display && mediaKind(view.display) !== "video"
        ? view.display
        : null;
  const raw = resolveMediaUrl(still?.url);
  if (!raw) return "";
  return proxiedUrl(raw, { width: size, format: "webp", q: 82 });
}

/** Resolve an NFT's media to a client-safe NftView (run on the server). */
export function toNftView(nft: {
  id: number;
  name?: string | null;
  artist_name?: string | null;
  display_animation_info?: unknown;
  display_media_info?: unknown;
  media_info?: unknown;
  response_opensea?: unknown;
}): NftView {
  const display = pickDisplayMedia(nft);
  const preview = pickPreviewMedia(nft) ?? display;
  return {
    id: nft.id,
    name: nft.name,
    artist_name: nft.artist_name,
    preview,
    display,
    isVideo: mediaKind(display) === "video",
    ratio: mediaRatio(preview, display),
  };
}

/** Clamp display dimensions to a max edge while preserving aspect ratio. */
export function clampDimensions(
  width = 512,
  height = 512,
  maxSize = 1280
): { width: number; height: number } {
  let w = width || 512;
  let h = height || 512;
  while (w > maxSize || h > maxSize) {
    if (w > maxSize) {
      h = Math.round((h * maxSize) / w);
      w = maxSize;
    }
    if (h > maxSize) {
      w = Math.round((w * maxSize) / h);
      h = maxSize;
    }
  }
  return { width: w, height: h };
}
