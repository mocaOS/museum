import {
  artworkTextureUrl,
  artworkVideoUrl,
  type NftView,
} from "@/lib/museum/media";
import type { Assignments, SlotOverride, SlotOverrides } from "./world-storage";
import type { WorldRoom } from "./WorldBuilder";

/**
 * Export the current world as a portable exhibition document for Hyperfy
 * (consumed by `apps/hyperfy/spawn-exhibition.mjs` in this repo).
 *
 * Privacy by design: this builds a JSON file and hands it to the visitor as a
 * download. Nothing is sent anywhere — the curation only reaches a Hyperfy
 * world when the curator runs the spawner against one themselves.
 */

export const HYPERFY_EXPORT_FORMAT = "moca-exhibition@1";

export interface HyperfyArtwork {
  slotId: string;
  name: string | null;
  artist: string | null;
  /** Trusted aspect ratio (w/h); 1 when unknown — the media itself wins. */
  ratio: number;
  /** Absolute, CORS-enabled still texture URL (null for video-only works). */
  imageUrl: string | null;
  /** Absolute mp4 URL for motion works (null for stills). */
  videoUrl: string | null;
  override: SlotOverride | null;
}

export interface HyperfyPlacement {
  uid: string;
  room: { id: number; title: string; modelUrl: string };
  position: [number, number, number];
  rotationY: number;
  artworks: HyperfyArtwork[];
}

export interface HyperfyExhibition {
  format: typeof HYPERFY_EXPORT_FORMAT;
  name: string;
  createdAt: string;
  generator: string;
  placements: HyperfyPlacement[];
}

function absolute(url: string): string {
  if (!url) return url;
  if (url.startsWith("/") && typeof window !== "undefined") {
    return window.location.origin + url;
  }
  return url;
}

export function buildHyperfyExhibition(opts: {
  name: string;
  placed: { uid: string; room: WorldRoom; position: [number, number, number]; rotationY: number }[];
  assignments: Record<string, Assignments>;
  overrides: Record<string, SlotOverrides>;
}): HyperfyExhibition {
  return {
    format: HYPERFY_EXPORT_FORMAT,
    name: opts.name,
    createdAt: new Date().toISOString(),
    generator:
      typeof window !== "undefined" ? window.location.origin : "museumofcryptoart.com",
    placements: opts.placed
      .filter((p) => p.room.modelUrl)
      .map((p) => ({
        uid: p.uid,
        room: { id: p.room.id, title: p.room.title, modelUrl: absolute(p.room.modelUrl!) },
        position: p.position,
        rotationY: p.rotationY,
        artworks: Object.entries(opts.assignments[p.uid] || {}).map(
          ([slotId, art]: [string, NftView]) => {
            const image = artworkTextureUrl(art, 1024);
            const video = artworkVideoUrl(art, 1024);
            return {
              slotId,
              name: art.name ?? null,
              artist: art.artist_name ?? null,
              ratio: art.ratio || 1,
              imageUrl: image ? absolute(image) : null,
              videoUrl: video || null,
              override: (opts.overrides[p.uid] || {})[slotId] ?? null,
            };
          }
        ),
      })),
  };
}

/** Hand the exhibition to the visitor as a .json download (device-local). */
export function downloadHyperfyExhibition(exhibition: HyperfyExhibition) {
  const blob = new Blob([JSON.stringify(exhibition, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${exhibition.name.replace(/[^\w-]+/g, "-").toLowerCase() || "exhibition"}.moca-exhibition.json`;
  a.click();
  URL.revokeObjectURL(url);
}
