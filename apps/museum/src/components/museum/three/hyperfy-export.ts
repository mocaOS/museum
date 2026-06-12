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

/**
 * One wall slot, baked into the export in GLB-local space. Carries the
 * oriented transform the builder actually hangs art with (authored slots get
 * the inward-to-room flip, auto slots face their surface normal) plus the
 * frame size, so spawners can anchor artworks WITHOUT relying on `Slot_NNN`
 * nodes existing in the uploaded GLB — un_MUSEUM auto-slots (`Auto_NNN`)
 * exist only at builder runtime, never as model nodes.
 */
export interface HyperfySlot {
  id: string;
  /** GLB-local position. */
  position: [number, number, number];
  /** GLB-local orientation, art facing local +Z. */
  quaternion: [number, number, number, number];
  /** Frame size in GLB-local units (artworks letterbox into it). */
  width: number;
  height: number;
}

/**
 * The builder's per-room normalization + slot map, measured from the loaded
 * GLB. The builder renders every room scaled to one TILE (8 builder units)
 * footprint, centered on its tile with the floor at y=0 — placement
 * positions live in that tile space. Spawners need these raw GLB
 * measurements to reproduce the exact layout at world scale (Hyperfy renders
 * GLBs at native size/pivot).
 */
export interface RoomNorm {
  /** max(bbox.size.x, bbox.size.z) of the GLB, raw units. */
  footprint: number;
  /** (-center.x, -bbox.min.y, -center.z) of the GLB, raw units. */
  groundOffset: [number, number, number];
  /** Every slot of the room (assigned or not), GLB-local. */
  slots: HyperfySlot[];
}

/** Builder tile size in builder units — placement positions are multiples of it. */
export const BUILDER_TILE = 8;

export interface HyperfyPlacement {
  uid: string;
  room: {
    id: number;
    title: string;
    modelUrl: string;
    footprint?: number;
    groundOffset?: [number, number, number];
  };
  position: [number, number, number];
  rotationY: number;
  /** Baked slot transforms (GLB-local) — the anchors artworks hang on. */
  slots?: HyperfySlot[];
  artworks: HyperfyArtwork[];
}

export interface HyperfyExhibition {
  format: typeof HYPERFY_EXPORT_FORMAT;
  /**
   * Stable exhibition identity (persisted with the layout). The spawners
   * derive deterministic blueprint/entity ids from it, so re-spawning the
   * same exhibition updates the rooms already in a world instead of
   * duplicating them. Optional: older exports fall back to `name`.
   */
  id?: string;
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
  id?: string;
  name: string;
  placed: { uid: string; room: WorldRoom; position: [number, number, number]; rotationY: number }[];
  assignments: Record<string, Assignments>;
  overrides: Record<string, SlotOverrides>;
  /** Per-placement GLB measurements (uid → norm), lifted from the loaded models. */
  norms?: Record<string, RoomNorm>;
}): HyperfyExhibition {
  return {
    format: HYPERFY_EXPORT_FORMAT,
    id: opts.id,
    name: opts.name,
    createdAt: new Date().toISOString(),
    generator:
      typeof window !== "undefined" ? window.location.origin : "museumofcryptoart.com",
    placements: opts.placed
      .filter((p) => p.room.modelUrl)
      .map((p) => ({
        uid: p.uid,
        room: {
          id: p.room.id,
          title: p.room.title,
          modelUrl: absolute(p.room.modelUrl!),
          footprint: opts.norms?.[p.uid]?.footprint,
          groundOffset: opts.norms?.[p.uid]?.groundOffset,
        },
        slots: opts.norms?.[p.uid]?.slots,
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
