import type { Metadata } from "next";
import Link from "next/link";
import { listRooms, assetUrl } from "@/lib/museum/directus";
import RoomsBrowser, { type RoomView } from "@/components/museum/RoomsBrowser";

// Rooms are cached hourly in the data layer (lib/museum/directus.ts), so the CMS
// isn't hit per request. Route stays dynamic via the root layout (runtime
// branding env); this revalidate applies if that constraint is lifted.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Exhibitions",
  description:
    "Step into immersive 3D rooms and curated shows from the MOCA universe.",
  alternates: { canonical: "/exhibitions" },
};

export default async function ExhibitionsPage() {
  const rooms = await listRooms();

  const views: RoomView[] = rooms.map((r) => ({
    id: r.id,
    title: r.title || "Untitled room",
    architect: r.architect,
    description: r.description,
    series: r.series,
    modelUrl: r.model ? assetUrl(r.model) : undefined,
    // Grid card: exact 4:3 WebP thumbnail (the card is object-cover 4:3).
    imageUrl: r.image
      ? assetUrl(r.image, { width: 800, height: 600, fit: "cover", quality: 72, format: "webp" })
      : undefined,
    // Lightbox: larger WebP, full frame (no crop), still a fraction of the original.
    imageLargeUrl: r.image
      ? assetUrl(r.image, { width: 1600, quality: 82, format: "webp" })
      : undefined,
  }));

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p
            className="mb-3 text-[11px] uppercase tracking-[0.16em]"
            style={{ color: "var(--fg3)" }}
          >
            Immersive
          </p>
          <h1
            className="text-4xl font-semibold sm:text-5xl"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            Exhibitions
          </h1>
          <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
            Step inside the architecture of the museum — explorable 3D rooms
            designed to hold the collection in space.
          </p>
        </div>
        <Link
          href="/exhibitions/world"
          className="flex h-11 items-center gap-2 rounded-[var(--radius)] px-5 text-sm font-medium transition-transform active:scale-[0.98]"
          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
        >
          Enter the World
        </Link>
      </header>

      <RoomsBrowser rooms={views} />
    </div>
  );
}
