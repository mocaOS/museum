"use client";

import { useState } from "react";
import { MediaInfo, mediaKind, resolveMediaUrl, proxiedUrl } from "@/lib/museum/media";
import ModelViewer from "./ModelViewer";

interface Props {
  media: MediaInfo | null;
  alt?: string;
  className?: string;
  fit?: "cover" | "contain";
  /** Allow model/iframe interactivity (lightbox) vs static preview (cards). */
  interactive?: boolean;
  /**
   * Size the media to fit fully within its container at its natural aspect
   * ratio (letterboxed), instead of filling the box. Used by the lightbox so
   * portrait/wide works are never cropped.
   */
  fitToBox?: boolean;
  /**
   * Reports the decoded media's real pixel dimensions. Catalog width/height
   * can describe a square CDN crop (see media.ts), so callers that size boxes
   * to the artwork's true ratio should prefer this over metadata.
   */
  onDimensions?: (width: number, height: number) => void;
}

// Renders any MOCA artwork media type: image, gif, video, 3D model, svg,
// raw/data, or iframe. Images/videos are routed through the transform-in proxy
// (revives dead source URLs + optimizes); falls back to the raw URL on error.
export default function MediaView({
  media,
  alt,
  className,
  fit = "contain",
  interactive = false,
  fitToBox = false,
  onDimensions,
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [rawFallback, setRawFallback] = useState(false);
  const kind = mediaKind(media);
  const rawUrl = resolveMediaUrl(media?.url);
  const label = alt ?? media?.alt ?? "Artwork";
  const objectFit = fit === "cover" ? "object-cover" : "object-contain";
  // Letterbox to fit the box (lightbox) vs fill it (cards).
  const sizeClass = fitToBox
    ? "max-h-full max-w-full object-contain"
    : `h-full w-full ${objectFit}`;

  if (!media || !rawUrl || kind === "unsupported") {
    return (
      <div
        className={`flex items-center justify-center text-xs ${className ?? ""}`}
        style={{ background: "var(--muted)", color: "var(--fg3)", minHeight: 120 }}
      >
        Unsupported media
      </div>
    );
  }

  const loader =
    !loaded && kind !== "model" && kind !== "iframe" ? (
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
          style={{ color: "var(--fg3)" }}
        />
      </div>
    ) : null;

  let inner: React.ReactNode;

  if (kind === "model") {
    inner = (
      <ModelViewer
        src={rawUrl}
        alt={label}
        cameraControls={interactive}
        autoRotate
        className="h-full w-full"
        onLoad={() => setLoaded(true)}
      />
    );
  } else if (kind === "video" || kind === "gif") {
    // GIFs are served as mp4 too (animated, lighter), matching the legacy app.
    // Video autoplays muted/looped here. The card-level perf win comes from
    // pickPreviewMedia(), which feeds a still poster for video works that have
    // one — so only the minority of video-only works reach this branch and play
    // (showing the art instead of a blank poster frame).
    const src = rawFallback
      ? rawUrl
      : proxiedUrl(rawUrl, { width: 1200, format: "mp4", q: 75 });
    inner = (
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        controls={interactive}
        onLoadedData={(e) => {
          setLoaded(true);
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) onDimensions?.(v.videoWidth, v.videoHeight);
        }}
        onError={() => {
          if (!rawFallback) setRawFallback(true);
          else setLoaded(true);
        }}
        className={sizeClass}
      />
    );
  } else if (kind === "iframe") {
    inner = (
      <iframe
        src={rawUrl}
        title={label}
        scrolling="no"
        className={`h-full w-full border-0 ${interactive ? "" : "pointer-events-none"}`}
      />
    );
  } else if (kind === "svg" || kind === "raw") {
    // Vector / data URIs render best untouched.
    // eslint-disable-next-line @next/next/no-img-element
    inner = (
      <img
        src={rawUrl}
        alt={label}
        loading="lazy"
        onLoad={(e) => {
          setLoaded(true);
          const i = e.currentTarget;
          if (i.naturalWidth && i.naturalHeight) onDimensions?.(i.naturalWidth, i.naturalHeight);
        }}
        onError={() => setLoaded(true)}
        className={sizeClass}
      />
    );
  } else {
    // raster image → proxied webp, with raw fallback on error
    const src = rawFallback
      ? rawUrl
      : proxiedUrl(rawUrl, { width: 1200, format: "webp", q: 78 });
    // eslint-disable-next-line @next/next/no-img-element
    inner = (
      <img
        src={src}
        alt={label}
        loading="lazy"
        onLoad={(e) => {
          setLoaded(true);
          const i = e.currentTarget;
          if (i.naturalWidth && i.naturalHeight) onDimensions?.(i.naturalWidth, i.naturalHeight);
        }}
        onError={() => {
          if (!rawFallback) setRawFallback(true);
          else setLoaded(true);
        }}
        className={sizeClass}
      />
    );
  }

  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className ?? ""}`}>
      {loader}
      {inner}
    </div>
  );
}
