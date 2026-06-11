import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listRooms, assetUrl, type Room } from "@/lib/museum/directus";
import RoomDetail, {
  type RoomDetailView,
  type RoomNeighbor,
} from "@/components/museum/RoomDetail";

// Rooms are cached hourly in the data layer (lib/museum/directus.ts); the
// route itself stays dynamic via the root layout (runtime branding env).
export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

/** The room plus its position in the (series, title)-sorted catalogue. */
async function getRoomContext(
  idRaw: string,
): Promise<{ rooms: Room[]; index: number } | null> {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rooms = await listRooms();
  const index = rooms.findIndex((r) => r.id === id);
  return index >= 0 ? { rooms, index } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const ctx = await getRoomContext(id);
  if (!ctx) return { title: "Room not found" };
  const room = ctx.rooms[ctx.index];
  const title = room.title || "Untitled room";
  const description =
    room.description?.slice(0, 200) ||
    `Step inside ${title}${room.architect ? `, architecture by ${room.architect},` : ""} — an immersive 3D exhibition room from the Museum of Crypto Art.`;
  return {
    title,
    description,
    alternates: { canonical: `/rooms/${room.id}` },
    openGraph: {
      title,
      description,
      images: room.image
        ? [assetUrl(room.image, { width: 1200, height: 630, fit: "cover", quality: 80, format: "jpg" })]
        : undefined,
    },
  };
}

export default async function RoomDetailPage({ params }: Props) {
  const { id } = await params;
  const ctx = await getRoomContext(id);
  if (!ctx) notFound();
  const { rooms, index } = ctx;
  const room = rooms[index];

  const view: RoomDetailView = {
    id: room.id,
    title: room.title || "Untitled room",
    architect: room.architect,
    description: room.description,
    series: room.series,
    slots: room.slots,
    modelUrl: room.model ? assetUrl(room.model) : undefined,
    // Veil/fallback still — large WebP, a fraction of the multi-MB original.
    posterUrl: room.image
      ? assetUrl(room.image, { width: 1920, quality: 80, format: "webp" })
      : undefined,
  };

  // Wrap-around neighbours so the arrow-key walk loops through the catalogue.
  const toNeighbor = (r: Room): RoomNeighbor => ({
    id: r.id,
    title: r.title || "Untitled room",
    modelUrl: r.model ? assetUrl(r.model) : undefined,
  });
  const prev =
    rooms.length > 1 ? toNeighbor(rooms[(index - 1 + rooms.length) % rooms.length]) : null;
  const next = rooms.length > 1 ? toNeighbor(rooms[(index + 1) % rooms.length]) : null;

  return (
    <div className="relative h-full">
      <RoomDetail room={view} prev={prev} next={next} index={index} total={rooms.length} />
    </div>
  );
}
