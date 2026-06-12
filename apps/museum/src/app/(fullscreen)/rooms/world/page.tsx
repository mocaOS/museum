import type { Metadata } from "next";
import { assetUrl, listRooms } from "@/lib/museum/directus";
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
  const worldRooms: WorldRoom[] = rooms.map(r => ({
    id: r.id,
    title: r.title || "Untitled room",
    architect: r.architect,
    // Onchain slot amount — drives runtime slot generation for models that
    // carry no Slot_NNN placeholders (un_MUSEUMs not yet processed by
    // apps/migration/embed-room-slots.ts).
    slotCount: r.slots ?? null,
    // Prefer the optimized builder variant (draco/webp + embedded slots);
    // the HQ `model` stays the /rooms/[id] viewer's version.
    modelUrl: r.model_optimized
      ? assetUrl(r.model_optimized)
      : r.model
        ? assetUrl(r.model)
        : undefined,
    // Used as a 3D plane texture — a medium WebP is ample and avoids loading
    // 100+ multi-megabyte JPEGs into the scene at once.
    imageUrl: r.image
      ? assetUrl(r.image, { width: 1024, quality: 78, format: "webp" })
      : undefined,
  }));

  return (
    <div className="relative h-full">
      <WorldClient rooms={worldRooms} />
    </div>
  );
}
