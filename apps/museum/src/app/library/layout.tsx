import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

// The Library page itself is a client component; route metadata lives here.
export const metadata: Metadata = pageMetadata({
  title: "Library",
  description:
    "Ask the Museum of Crypto Art anything. The Library answers questions about crypto art history, the collection, and Web3 culture with cited sources from the MOCA Cortex knowledge graph.",
  path: "/library",
  image: "/cortex/library.jpg",
  imageAlt: "The MOCA Library — ask anything about crypto art, with cited sources",
});

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
