"use client";

import { useCallback, useEffect } from "react";
import type { Nft } from "@/lib/museum/directus";
import { pickDisplayMedia } from "@/lib/museum/media";
import MediaView from "./MediaView";

interface Props {
  nfts: Nft[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export default function NftLightbox({ nfts, index, onClose, onNavigate }: Props) {
  const nft = nfts[index];
  const hasPrev = index > 0;
  const hasNext = index < nfts.length - 1;

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < nfts.length) onNavigate(next);
    },
    [index, nfts.length, onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose]);

  if (!nft) return null;
  const media = pickDisplayMedia(nft);

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
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 sm:px-16">
        {hasPrev && (
          <NavButton
            side="left"
            onClick={(e) => {
              e.stopPropagation();
              go(-1);
            }}
          />
        )}

        <div
          className="flex max-h-full max-w-5xl items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <MediaView
            key={nft.id}
            media={media}
            alt={nft.name ?? "Artwork"}
            fit="contain"
            interactive
            className="max-h-[70vh] w-auto"
          />
        </div>

        {hasNext && (
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
          {nft.name || "Untitled"}
        </div>
        {nft.artist_name && (
          <div className="mt-1 text-sm" style={{ color: "oklch(0.75 0 0)" }}>
            by {nft.artist_name}
          </div>
        )}
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
