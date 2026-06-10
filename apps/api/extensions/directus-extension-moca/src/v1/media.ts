/**
 * Artwork media normalization for the public /v1 API.
 *
 * Mirrors the museum frontend's media logic (apps/museum/src/lib/museum/media.ts):
 * - dead-host revival (openseauserdata.com → live seadn URLs)
 * - original-file preference over OpenSea's conversion CDN (i2c.seadn.io serves
 *   ≤500px variants that are frequently square-CROPPED — integrators should get
 *   the artwork, not a square cutout)
 * - aspect ratios only from dimensions that can be trusted (never from a
 *   conversion-CDN square)
 *
 * Integrators receive one flat `media` (best still) + optional `animation`
 * (motion variant) per artwork, with resolved https URLs.
 */

export interface MediaInfo {
  type?: string;
  content_type?: string;
  url?: string;
  width?: number;
  height?: number;
}

export interface NormalizedMedia {
  url: string;
  type: string;
  content_type?: string;
  width?: number;
  height?: number;
}

export interface NormalizedArtwork {
  id: number;
  name: string | null;
  artist_name: string | null;
  collection: string | null;
  media: NormalizedMedia | null;
  animation: NormalizedMedia | null;
  ratio: number;
  opensea_url: string | null;
}

const DEAD_MEDIA_HOSTS = ["openseauserdata.com"];
const CONVERSION_CDN_HOSTS = ["i2c.seadn.io"];
const NON_IMAGE_EXT = /\.(mp4|webm|mov|avi|glb|gltf|html?|js)(\?|$)/i;
const IPFS_GATEWAY = "https://ipfs.qwellcode.de/ipfs/";

interface OpenseaUrls {
  image_url?: string;
  display_image_url?: string;
  display_animation_url?: string;
  animation_url?: string;
  original_image_url?: string;
  opensea_url?: string;
}

function isDead(url?: string): boolean {
  return !!url && DEAD_MEDIA_HOSTS.some((h) => url.includes(h));
}

function resolveUrl(url?: string): string {
  if (!url) return "";
  if (url.startsWith("ipfs://")) {
    return IPFS_GATEWAY + url.slice("ipfs://".length).replace(/^ipfs\//, "");
  }
  return url;
}

function reviveUrl(m: MediaInfo, ro: OpenseaUrls | null, preferStill: boolean): MediaInfo {
  if (!isDead(m.url) || !ro) return m;
  const order = preferStill
    ? [ro.display_image_url, ro.image_url, ro.display_animation_url, ro.animation_url]
    : [ro.display_animation_url, ro.animation_url, ro.display_image_url, ro.image_url];
  const live = order.find((u) => u && !isDead(u));
  return live ? { ...m, url: live } : m;
}

/** Swap a conversion-CDN still for the artwork's original file. */
function preferOriginal(m: MediaInfo, ro: OpenseaUrls | null): MediaInfo {
  const original = ro?.original_image_url;
  if (!original || isDead(original) || NON_IMAGE_EXT.test(original)) return m;
  if (!CONVERSION_CDN_HOSTS.some((h) => (m.url || "").includes(h))) return m;
  if (m.url === original) return m;
  const square = !!m.width && m.width === m.height;
  return {
    ...m,
    url: original,
    ...(square ? { width: undefined, height: undefined } : {}),
  };
}

function trustedRatio(...candidates: (MediaInfo | null | undefined)[]): number {
  for (const m of candidates) {
    if (!m?.width || !m?.height) continue;
    if (m.width === m.height && CONVERSION_CDN_HOSTS.some((h) => (m.url || "").includes(h))) {
      continue;
    }
    return m.width / m.height;
  }
  return 1;
}

function normalize(m: MediaInfo | null): NormalizedMedia | null {
  const url = resolveUrl(m?.url);
  if (!m || !url) return null;
  return {
    url,
    type: m.type || "image",
    content_type: m.content_type,
    width: m.width || undefined,
    height: m.height || undefined,
  };
}

export interface NftRow {
  id: number;
  name?: string | null;
  artist_name?: string | null;
  collection?: string | null;
  media_info?: MediaInfo | null;
  display_media_info?: MediaInfo | null;
  display_animation_info?: MediaInfo | null;
  response_opensea?: OpenseaUrls | null;
}

export function normalizeArtwork(nft: NftRow): NormalizedArtwork {
  const ro = (nft.response_opensea as OpenseaUrls) || null;

  // Best still: media_info (original-probed) first, then the display variant.
  let still: MediaInfo | null = null;
  for (const candidate of [nft.media_info, nft.display_media_info]) {
    if (candidate && candidate.url && candidate.type !== "video" && candidate.type !== "model") {
      still = candidate;
      break;
    }
  }
  if (still) still = preferOriginal(reviveUrl(still, ro, true), ro);

  // Motion variant, when the work has one.
  let animation: MediaInfo | null = null;
  const anim = nft.display_animation_info;
  if (anim && anim.url) animation = reviveUrl(anim, ro, false);

  return {
    id: nft.id,
    name: nft.name ?? null,
    artist_name: nft.artist_name ?? null,
    collection: nft.collection ?? null,
    media: normalize(still),
    animation: normalize(animation),
    ratio: trustedRatio(nft.media_info, still, animation),
    opensea_url: ro?.opensea_url ?? null,
  };
}
