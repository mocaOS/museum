"use client";

import type { Nft } from "@/lib/museum/directus";
import { pickDisplayMedia } from "@/lib/museum/media";
import MediaView from "./MediaView";

interface Props {
  nft: Nft;
  onView: () => void;
}

export default function NftCard({ nft, onView }: Props) {
  const media = pickDisplayMedia(nft);
  if (!media) return null;

  return (
    <button
      onClick={onView}
      className="group relative block w-full overflow-hidden rounded-[var(--radius)] border text-left transition-transform duration-200 hover:-translate-y-0.5"
      style={{ borderColor: "var(--border)", background: "var(--card)" }}
    >
      <MediaView media={media} alt={nft.name ?? "Artwork"} fit="cover" className="w-full" />

      {/* Always-visible caption strip */}
      <div
        className="border-t px-3.5 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="truncate text-sm font-medium" style={{ color: "var(--fg1)" }}>
          {nft.name || "Untitled"}
        </div>
        <div className="truncate text-xs" style={{ color: "var(--fg2)" }}>
          {nft.artist_name ? `by ${nft.artist_name}` : "Unknown artist"}
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
