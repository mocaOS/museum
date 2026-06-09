"use client";

import { useState } from "react";
import type { NftView } from "@/lib/museum/media";
import NftCard from "./NftCard";
import NftLightbox from "./NftLightbox";

interface Props {
  nfts: NftView[];
  emptyMessage?: string;
}

// Masonry grid (CSS columns) + lightbox. The list itself is provided by the
// server component; this client wrapper only owns the open/navigate state.
export default function GalleryGrid({ nfts, emptyMessage }: Props) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!nfts.length) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: "var(--fg2)" }}>
        {emptyMessage ?? "No artworks found."}
      </div>
    );
  }

  return (
    <>
      <div className="gap-6 [column-fill:_balance] columns-1 sm:columns-2 lg:columns-3 xl:columns-4">
        {nfts.map((view, i) => (
          <div key={view.id} className="mb-6 break-inside-avoid">
            <NftCard view={view} onView={() => setOpenIndex(i)} />
          </div>
        ))}
      </div>

      {openIndex !== null && (
        <NftLightbox
          items={nfts}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </>
  );
}
