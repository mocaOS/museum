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

/**
 * Pick the best media blob for display, preferring an animated/video variant,
 * then the optimized display variant, then the raw original.
 */
export function pickDisplayMedia(nft: {
  display_animation_info?: unknown;
  display_media_info?: unknown;
  media_info?: unknown;
}): MediaInfo | null {
  return (
    (nft.display_animation_info as MediaInfo) ||
    (nft.display_media_info as MediaInfo) ||
    (nft.media_info as MediaInfo) ||
    null
  );
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
