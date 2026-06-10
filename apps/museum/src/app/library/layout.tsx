import type { Metadata } from "next";

// The Library page itself is a client component; route metadata lives here.
export const metadata: Metadata = {
  title: "Library",
  description:
    "Ask the Museum of Crypto Art anything. The Library answers questions about crypto art history, the collection, and Web3 culture with cited sources from the MOCA Cortex knowledge graph.",
  alternates: { canonical: "/library" },
};

export default function LibraryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
