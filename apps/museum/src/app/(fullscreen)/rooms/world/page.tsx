import type { Metadata } from "next";
import Link from "next/link";
import { listRooms, assetUrl } from "@/lib/museum/directus";
import WorldClient from "@/components/museum/three/WorldClient";
import type { WorldRoom } from "@/components/museum/three/WorldBuilder";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "World Builder",
  description:
    "Build your own museum: place MOCA exhibition rooms into a shared world, hang artworks from the collection, and save your exhibits.",
  path: "/rooms/world",
});

export default async function WorldPage() {
  const rooms = await listRooms();
  const worldRooms: WorldRoom[] = rooms.map((r) => ({
    id: r.id,
    title: r.title || "Untitled room",
    architect: r.architect,
    modelUrl: r.model ? assetUrl(r.model) : undefined,
    // Used as a 3D plane texture — a medium WebP is ample and avoids loading
    // 100+ multi-megabyte JPEGs into the scene at once.
    imageUrl: r.image
      ? assetUrl(r.image, { width: 1024, quality: 78, format: "webp" })
      : undefined,
  }));

  return (
    <div className="relative h-full">
      <div className="absolute left-4 top-3 z-20">
        <Link
          href="/rooms"
          className="flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs"
          style={{ background: "oklch(0.14 0 0 / 0.8)", borderColor: "var(--border)", color: "var(--fg1)", backdropFilter: "blur(12px)" }}
        >
          ← MOCA ROOMs
        </Link>
      </div>
      <WorldClient rooms={worldRooms} />
    </div>
  );
}
