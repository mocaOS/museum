// Helpers for embedding YouTube / Vimeo players from a watch/share URL.

export type VideoPlatform = "YouTube" | "Vimeo";

export interface VideoRef {
  url: string;
  platform: VideoPlatform;
  title: string;
}

/** Parse the video id out of a YouTube or Vimeo URL. */
export function videoId(v: { url: string; platform: VideoPlatform }): string {
  if (v.platform === "Vimeo") {
    return v.url.split("?")[0].split("/").filter(Boolean).pop() ?? "";
  }
  return v.url.match(/[?&]v=([^&]+)/)?.[1] ?? v.url.split("/").filter(Boolean).pop() ?? "";
}

/** Embeddable player URL (privacy-friendly host for YouTube). */
export function embedSrc(v: { url: string; platform: VideoPlatform }): string {
  const id = videoId(v);
  if (v.platform === "Vimeo") return `https://player.vimeo.com/video/${id}?autoplay=1`;
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
}

/** Lightweight poster image (used as a fast-loading facade before play). */
export function posterSrc(v: { url: string; platform: VideoPlatform }): string | null {
  if (v.platform !== "YouTube") return null;
  return `https://i.ytimg.com/vi/${videoId(v)}/hqdefault.jpg`;
}
