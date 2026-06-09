"use client";

import type { NftView } from "@/lib/museum/media";
import MediaView from "./MediaView";

interface Props {
  view: NftView;
  onView: () => void;
}

export default function NftCard({ view, onView }: Props) {
  // Overview card: show the still poster when the work is a video; the full
  // clip plays in the lightbox. Media was resolved server-side.
  const media = view.preview ?? view.display;
  if (!media) return null;
  const isVideo = view.isVideo;

  return (
    <button
      onClick={onView}
      className="group relative block w-full overflow-hidden rounded-[var(--radius)] border text-left transition-transform duration-200 hover:-translate-y-0.5"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <MediaView media={media} alt={view.name ?? "Artwork"} fit="cover" className="w-full" />

      {/* Video affordance — the still is a poster; the clip plays in the lightbox */}
      {isVideo && (
        <span
          className="absolute left-2 top-2 flex items-center gap-1 rounded-full px-2 py-1 text-[10px] uppercase tracking-wide"
          style={{ background: "oklch(0 0 0 / 0.55)", color: "oklch(1 0 0)" }}
          aria-hidden
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
          Video
        </span>
      )}

      {/* Always-visible caption strip */}
      <div
        className="border-t px-3.5 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="truncate text-sm font-medium" style={{ color: "var(--fg1)" }}>
          {view.name || "Untitled"}
        </div>
        <div className="truncate text-xs" style={{ color: "var(--fg2)" }}>
          {view.artist_name ? `by ${view.artist_name}` : "Unknown artist"}
        </div>
      </div>

      {/* Hover zoom affordance */}
      <span
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        style={{ background: "oklch(0 0 0 / 0.5)", color: "oklch(1 0 0)" }}
        aria-hidden
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3 -4.3" />
          <path d="M11 8v6M8 11h6" />
        </svg>
      </span>
    </button>
  );
}
