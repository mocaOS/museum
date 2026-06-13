import type { Metadata } from "next";
import { assetUrl, listRooms } from "@/lib/museum/directus";
import WorldClient from "@/components/museum/three/WorldClient";
import type { WorldRoom } from "@/components/museum/three/WorldBuilder";
import type { RoomSlotData } from "@/components/museum/three/slots";
import { pageMetadata } from "@/lib/seo";

/**
 * Baked slot data is only trustworthy when it was computed from the exact GLB
 * the builder is about to load — a re-uploaded or re-optimized model with a
 * stale bake would hang works on anchors that no longer exist. Stale data is
 * dropped here so the builder falls back to runtime extraction + the facing
 * probe (re-run apps/migration/bake-slot-data.ts to refresh).
 */
function freshSlotData(slotData: unknown, modelFileId: string): RoomSlotData | undefined {
  const data = slotData as RoomSlotData | null | undefined;
  if (!data || data.version !== 1 || !Array.isArray(data.slots) || !data.slots.length) {
    return undefined;
  }
  return data.model === modelFileId ? data : undefined;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "World Builder",
  description:
    "Build your own museum: place MOCA exhibition rooms into a shared world, hang artworks from the collection, and save your exhibits.",
  path: "/rooms/world",
});

export default async function WorldPage() {
  const rooms = await listRooms();
  const worldRooms: WorldRoom[] = rooms.map((r) => {
    // Prefer the optimized builder variant (draco/webp + embedded slots);
    // the HQ `model` stays the /rooms/[id] viewer's version.
    const modelFileId = r.model_optimized || r.model || null;
    return {
      id: r.id,
      title: r.title || "Untitled room",
      architect: r.architect,
      // Onchain slot amount — drives runtime slot generation for models that
      // carry no Slot_NNN placeholders (un_MUSEUMs not yet processed by
      // apps/migration/embed-room-slots.ts).
      slotCount: r.slots ?? null,
      // Baked slot anchors with resolved facing (rooms.slot_data), dropped
      // when stale relative to the GLB being loaded.
      slotData: modelFileId ? freshSlotData(r.slot_data, modelFileId) : undefined,
      modelUrl: modelFileId ? assetUrl(modelFileId) : undefined,
      // Used as a 3D plane texture — a medium WebP is ample and avoids loading
      // 100+ multi-megabyte JPEGs into the scene at once.
      imageUrl: r.image
        ? assetUrl(r.image, { width: 1024, quality: 78, format: "webp" })
        : undefined,
    };
  });

  return (
    <div className="relative h-full">
      <WorldClient rooms={worldRooms} />
    </div>
  );
}
