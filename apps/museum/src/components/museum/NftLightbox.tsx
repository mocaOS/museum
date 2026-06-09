"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { NftView } from "@/lib/museum/media";
import { mediaKind, resolveMediaUrl, proxiedUrl } from "@/lib/museum/media";
import MediaView from "./MediaView";

interface Props {
  items: NftView[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function NftLightbox({ items, index, onClose, onNavigate }: Props) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  // When the image is zoomed, suppress arrow navigation and the prev/next
  // affordances so panning gestures don't collide with them.
  const [zoomed, setZoomed] = useState(false);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < items.length) onNavigate(next);
    },
    [index, items.length, onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (zoomed) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose, zoomed]);

  // Reset zoom whenever the shown work changes.
  useEffect(() => setZoomed(false), [item?.id]);

  if (!item) return null;
  const media = item.display;
  const kind = mediaKind(media);
  const isImage = kind === "image";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "oklch(0 0 0 / 0.92)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      {/* Top bar */}
      <div className="flex items-center justify-end p-4">
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full transition-colors"
          style={{ color: "oklch(1 0 0)", background: "oklch(1 0 0 / 0.08)" }}
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Stage */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-2 sm:px-16">
        {hasPrev && !zoomed && (
          <NavButton
            side="left"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          />
        )}

        <div
          className="flex h-full w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {isImage && media?.url ? (
            <ZoomableImage
              key={item.id}
              url={media.url}
              alt={item.name ?? "Artwork"}
              onZoomChange={setZoomed}
            />
          ) : (
            <MediaView
              key={item.id}
              media={media}
              alt={item.name ?? "Artwork"}
              fit="contain"
              interactive
              fitToBox
              className="h-full w-full"
            />
          )}
        </div>

        {hasNext && !zoomed && (
          <NavButton
            side="right"
            onClick={(e) => {
              e.stopPropagation();
              go(1);
            }}
          />
        )}
      </div>

      {/* Caption */}
      <div className="p-6 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="text-lg font-medium" style={{ color: "oklch(1 0 0)" }}>
          {item.name || "Untitled"}
        </div>
        {item.artist_name && (
          <div className="mt-1 text-sm" style={{ color: "oklch(0.75 0 0)" }}>
            by {item.artist_name}
          </div>
        )}
      </div>
    </div>
  );
}

const ZOOM = 2.5;

// Click/tap to toggle zoom; when zoomed, drag (mouse) or swipe (touch) to pan.
// Pointer Events unify mouse + touch so the same code path works everywhere.
// A higher-resolution variant is loaded once the user zooms in, so details
// stay crisp; the base 1200px variant is used for the fitted view.
function ZoomableImage({
  url,
  alt,
  onZoomChange,
}: {
  url: string;
  alt: string;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [useRaw, setUseRaw] = useState(false);
  const [t, setT] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{ sx: number; sy: number; tx: number; ty: number; moved: boolean } | null>(null);

  const raw = resolveMediaUrl(url);
  const baseSrc = useRaw ? raw : proxiedUrl(raw, { width: 1200, format: "webp", q: 80 });
  const zoomSrc = useRaw ? raw : proxiedUrl(raw, { width: 2600, format: "webp", q: 82 });
  const src = zoomed ? zoomSrc : baseSrc;

  const setZoom = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
      if (!next) setT({ x: 0, y: 0 });
    },
    [onZoomChange]
  );

  // Keep the translate within bounds so the image can't be panned off-screen.
  const clamp = useCallback((x: number, y: number) => {
    const wrap = wrapRef.current;
    const img = imgRef.current;
    if (!wrap || !img) return { x, y };
    // offset* is the fitted (scale 1) layout size; transform scaling doesn't change it.
    const maxX = Math.max(0, (img.offsetWidth * ZOOM - wrap.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * ZOOM - wrap.clientHeight) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, x)), y: Math.min(maxY, Math.max(-maxY, y)) };
  }, []);

  // Zoom in toward the point that was clicked/tapped.
  const zoomInAt = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current;
      if (wrap) {
        const r = wrap.getBoundingClientRect();
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height / 2);
        setT(clamp(-ZOOM * dx, -ZOOM * dy));
      }
      setZoom(true);
    },
    [clamp, setZoom]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (!zoomed) return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, tx: t.x, ty: t.y, moved: false };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const ddx = e.clientX - d.sx;
    const ddy = e.clientY - d.sy;
    if (Math.abs(ddx) > 3 || Math.abs(ddy) > 3) d.moved = true;
    setT(clamp(d.tx + ddx, d.ty + ddy));
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    // A tap (no real movement) while zoomed resets to the fitted view.
    if (zoomed && d && !d.moved) setZoom(false);
  };

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!zoomed) zoomInAt(e.clientX, e.clientY);
  };

  return (
    <div
      ref={wrapRef}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="relative flex h-full w-full select-none items-center justify-center overflow-hidden"
      style={{
        cursor: zoomed ? (dragging ? "grabbing" : "grab") : "zoom-in",
        touchAction: zoomed ? "none" : "auto",
      }}
    >
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span
            className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent"
            style={{ color: "oklch(0.75 0 0)" }}
          />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (!useRaw) setUseRaw(true);
          else setLoaded(true);
        }}
        className="max-h-full max-w-full object-contain"
        style={{
          transform: `translate(${t.x}px, ${t.y}px) scale(${zoomed ? ZOOM : 1})`,
          transformOrigin: "center",
          transition: dragging ? "none" : "transform 0.2s ease",
        }}
      />

      {/* Hint */}
      <div
        className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] tracking-wide"
        style={{ background: "oklch(0 0 0 / 0.5)", color: "oklch(0.92 0 0)" }}
      >
        {zoomed ? "Drag to explore · tap to reset" : "Click to zoom"}
      </div>
    </div>
  );
}

function NavButton({
  side,
  onClick,
}: {
  side: "left" | "right";
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full transition-colors ${
        side === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6"
      }`}
      style={{ color: "oklch(1 0 0)", background: "oklch(1 0 0 / 0.08)" }}
      aria-label={side === "left" ? "Previous" : "Next"}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}
