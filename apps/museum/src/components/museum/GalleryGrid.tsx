"use client";

import { useState } from "react";
import type { Nft } from "@/lib/museum/directus";
import NftCard from "./NftCard";
import NftLightbox from "./NftLightbox";

interface Props {
  nfts: Nft[];
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
        {nfts.map((nft, i) => (
          <div key={nft.id} className="mb-6 break-inside-avoid">
            <NftCard nft={nft} onView={() => setOpenIndex(i)} />
          </div>
        ))}
      </div>

      {openIndex !== null && (
        <NftLightbox
          nfts={nfts}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </>
  );
}
