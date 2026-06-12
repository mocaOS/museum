"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import MediaView from "./MediaView";
import type { MediaInfo } from "@/lib/museum/media";

interface Props {
  href: string;
  title: string;
  description?: string | null;
  previews: (MediaInfo | null)[];
  /**
   * Collection slugs (parent + children). When set, the shuffle button
   * lazily pulls random batches from /api/museum/previews so it draws from
   * the entire collection instead of cycling the server-shipped batch.
   */
  slugs?: string[];
  aspect?: string;
}

// Beyond this many cached pieces we stop fetching more — plenty of variety
// without holding an entire large collection in memory.
const POOL_CAP = 96;

// Deterministic index from a stable seed (the card href), so the initial piece
// is varied per collection yet identical on server and client — avoids a
// hydration mismatch that Math.random() in render would cause. The shuffle
// button (a client-only event) still randomizes freely.
function seededIndex(seed: string, n: number): number {
  if (n <= 0) return 0;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % n;
}

// Collection cover card. Shows a piece (cropped to the card), with a shuffle
// button — that stays inside the card — to click through the works. On hover,
// the exact current piece is "spawned" larger, in its true aspect ratio,
// floating just below the cursor: the artwork shown properly.
export default function CollectionCard({
  href,
  title,
  description,
  previews,
  slugs,
  aspect = "aspect-[16/10]",
}: Props) {
  const valid = previews.filter(Boolean) as MediaInfo[];
  // The shuffle pool starts as the server-shipped batch and grows with random
  // batches fetched from across the whole collection. Append-only, so indices
  // already shown stay stable.
  const [pool, setPool] = useState<MediaInfo[]>(valid);
  const [idx, setIdx] = useState(() => seededIndex(href, valid.length));
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);
  // Real decoded pixel ratio per piece, reported by MediaView once the card's
  // media loads. Catalog dims can describe a square CDN crop, so measured
  // pixels win for the floating preview's box shape.
  const [measured, setMeasured] = useState<Record<number, number>>({});
  useEffect(() => setMounted(true), []);

  // Indices already shown this session — shuffle walks the pool without
  // repeats until every piece has been seen, then starts over.
  const seenRef = useRef<Set<number>>(new Set([seededIndex(href, valid.length)]));
  const fetchingRef = useRef(false);
  const exhaustedRef = useRef(false);

  const media = pool[idx] ?? null;

  // Top up the pool from a random slice of the full collection.
  const topUp = () => {
    if (!slugs?.length || fetchingRef.current || exhaustedRef.current) return;
    fetchingRef.current = true;
    fetch(`/api/museum/previews?slugs=${encodeURIComponent(slugs.join(","))}&count=24`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { previews?: MediaInfo[]; total?: number } | null) => {
        if (!data?.previews?.length) return;
        setPool((prev) => {
          const seen = new Set(prev.map((m) => m.url));
          const fresh = data.previews!.filter((m) => m.url && !seen.has(m.url));
          const next = [...prev, ...fresh];
          if ((data.total && next.length >= data.total) || next.length >= POOL_CAP) {
            exhaustedRef.current = true;
          }
          return next;
        });
      })
      .catch(() => {})
      .finally(() => {
        fetchingRef.current = false;
      });
  };

  const shuffle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    topUp();
    if (pool.length < 2) return;
    const seen = seenRef.current;
    if (seen.size >= pool.length) {
      seen.clear();
      seen.add(idx);
    }
    const unseen: number[] = [];
    for (let i = 0; i < pool.length; i++) if (!seen.has(i)) unseen.push(i);
    const next = unseen.length
      ? unseen[Math.floor(Math.random() * unseen.length)]
      : (idx + 1) % pool.length;
    seen.add(next);
    setIdx(next);
  };

  // Floating preview: true aspect ratio, capped to a comfortable size.
  const ratio =
    measured[idx] ??
    (media?.width && media?.height ? media.width / media.height : 1);
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
          <MediaView
            key={idx}
            media={media}
            alt={title}
            fit="cover"
            className="h-full w-full"
            onDimensions={(w, h) => setMeasured((m) => (m[idx] ? m : { ...m, [idx]: w / h }))}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--fg3)" }}>
            {title}
          </div>
        )}
      </div>

      {(pool.length > 1 || (!!slugs?.length && pool.length > 0)) && (
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
