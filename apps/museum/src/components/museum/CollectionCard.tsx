"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import MediaView from "./MediaView";
import type { MediaInfo } from "@/lib/museum/media";

interface Props {
  href: string;
  title: string;
  description?: string | null;
  previews: (MediaInfo | null)[];
  aspect?: string;
}

// Collection cover card. Shows a random piece (cropped to the card), with a
// shuffle button — that stays inside the card — to click through the works.
// On hover, the exact current piece is "spawned" larger, in its true aspect
// ratio, floating just below the cursor: the artwork shown properly.
export default function CollectionCard({
  href,
  title,
  description,
  previews,
  aspect = "aspect-[16/10]",
}: Props) {
  const valid = previews.filter(Boolean) as MediaInfo[];
  const [idx, setIdx] = useState(() =>
    valid.length ? Math.floor(Math.random() * valid.length) : 0
  );
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const media = valid[idx] ?? null;

  const shuffle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (valid.length < 2) return;
    let next = idx;
    while (next === idx) next = Math.floor(Math.random() * valid.length);
    setIdx(next);
  };

  // Floating preview: true aspect ratio, capped to a comfortable size.
  const ratio = media?.width && media?.height ? media.width / media.height : 1;
  const MAX = 400;
  const pw = ratio >= 1 ? MAX : Math.round(MAX * ratio);
  const ph = ratio >= 1 ? Math.round(MAX / ratio) : MAX;

  let left = pos.x - pw / 2;
  let top = pos.y + 28; // below the cursor
  if (typeof window !== "undefined") {
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    if (top + ph > window.innerHeight - 8) top = pos.y - ph - 28; // flip above if no room
    top = Math.max(8, top);
  }

  return (
    <div
      className="group relative overflow-hidden rounded-[var(--radius-xl)] border transition-transform duration-200 hover:-translate-y-1"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
    >
      <Link href={href} aria-label={title} className="absolute inset-0 z-[1]" />

      <div className={`pointer-events-none overflow-hidden ${aspect}`} style={{ background: "var(--muted)" }}>
        {media ? (
          <MediaView key={idx} media={media} alt={title} fit="cover" className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--fg3)" }}>
            {title}
          </div>
        )}
      </div>

      {valid.length > 1 && (
        <button
          onClick={shuffle}
          className="absolute right-2 top-2 z-[3] flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          style={{ background: "oklch(0 0 0 / 0.6)", color: "oklch(1 0 0)" }}
          title="Show another piece"
          aria-label="Show another piece from this collection"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
        </button>
      )}

      <div className="pointer-events-none relative z-[1] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium sm:text-lg" style={{ color: "var(--fg1)" }}>
            {title}
          </h2>
          <span className="transition-transform group-hover:translate-x-1" style={{ color: "var(--accent)" }} aria-hidden>
            →
          </span>
        </div>
        {description && (
          <p className="mt-1.5 line-clamp-2 text-sm" style={{ color: "var(--fg2)" }}>
            {description}
          </p>
        )}
      </div>

      {/* Cursor-following true-ratio preview of the exact piece */}
      {mounted &&
        hover &&
        media &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] overflow-hidden rounded-[var(--radius)] border"
            style={{
              left,
              top,
              width: pw,
              height: ph,
              background: "var(--card)",
              borderColor: "var(--border)",
              boxShadow: "0 24px 60px oklch(0 0 0 / 0.6)",
            }}
          >
            <MediaView key={`hov-${idx}`} media={media} alt={title} fit="contain" className="h-full w-full" />
          </div>,
          document.body
        )}
    </div>
  );
}
