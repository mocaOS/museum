import { buildGuideSpatialMap, generateGuideScript } from "./guide-script";
import { randomUuid } from "./hash";
import { buildHyp, hypAssetUrl } from "./hyp";
import type { HyperfyExhibition } from "@/components/museum/three/hyperfy-export";

/**
 * The museum guide as a portable `.hyp` app — built entirely in the
 * curator's browser and handed over as a download. Drop the file into ANY
 * Hyperfy world in build mode (no world URL, no admin key, no spawner) and
 * the guide stands where you dropped it: VRM body + agentic script bundled.
 *
 * Registering the exhibition context with the MOCA API still happens here
 * (it's what the guide answers from), so building the file is the same
 * explicit opt-in moment as spawning with a guide. The dropped app is
 * retargetable in-world: its Exhibition id / DeCC0 persona / API live in
 * the inspector (right-click → App pane).
 *
 * CLI twin: apps/hyperfy/build-guide-app.mjs.
 */

export const DEFAULT_GUIDE_API = "https://api.moca.qwellco.de";

export interface GuideRegistration {
  /** The id the guide app will ask /v1/guide/ask about. */
  id: string;
  /** True when the MOCA API accepted (or refreshed) the context. */
  registered: boolean;
  suggestions: string[];
  counts: { rooms: number; artworks: number };
}

/** Stable, URL-safe exhibition id — same fallback rule as the spawners. */
export function guideExhibitionId(exhibition: HyperfyExhibition): string {
  return (
    exhibition.id
    || (exhibition.name || "exhibition").replace(/[^\w.:-]+/g, "-").toLowerCase()
  );
}

/**
 * Register (or refresh) the exhibition context with the MOCA API. Failure is
 * never fatal — the guide then runs on baked knowledge until a later
 * registration lands.
 */
export async function registerGuideExhibition(
  exhibition: HyperfyExhibition,
  apiUrl: string = DEFAULT_GUIDE_API,
  /** Meters one builder tile maps to in-world — same value the spawn used; lets
   * the guide resolve which room a visitor stands in (spatial awareness). */
  tileMeters = 16,
): Promise<GuideRegistration> {
  const id = guideExhibitionId(exhibition);
  // Builder tile = 8 units; k converts tile-space positions to world meters.
  const k = tileMeters / 8;
  const fallback: GuideRegistration = {
    id,
    registered: false,
    suggestions: [],
    counts: { rooms: exhibition.placements.length, artworks: 0 },
  };
  try {
    const res = await fetch(`${apiUrl.replace(/\/+$/, "")}/v1/guide/exhibitions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format: "moca-exhibition@1",
        id,
        name: exhibition.name,
        generator: exhibition.generator,
        placements: exhibition.placements.map(p => ({
          uid: p.uid,
          room: { id: p.room.id, title: p.room.title },
          // World floor-plane center + footprint radius (meters): rooms sit on
          // tiles, scaled so one tile spans tileMeters × the room's scale.
          location: {
            x: k * p.position[0],
            z: k * p.position[2],
            r: (tileMeters * (Number(p.scale) || 1)) / 2,
          },
          artworks: p.artworks.map(a => ({ id: a.id, name: a.name, artist: a.artist })),
        })),
      }),
    });
    if (!res.ok) return fallback;
    const { data } = await res.json();
    return {
      id,
      registered: true,
      suggestions: data?.suggestions || [],
      counts: {
        rooms: data?.counts?.rooms ?? fallback.counts.rooms,
        artworks: data?.counts?.artworks ?? 0,
      },
    };
  } catch {
    return fallback;
  }
}

export interface GuideHypOptions {
  /** The guide's display name (default "Oblak"). */
  name?: string;
  /** Absolute or site-relative URL of the .vrm the guide embodies. */
  avatarUrl: string;
  /** Art DeCC0 token id whose persona the guide adopts (default 2875, Oblak). */
  decc0Id?: number;
  /** A SOUL.md the guide embodies — uploaded by the curator; beats decc0/soulRef. */
  customSoul?: string;
  /** Display name for the custom soul. */
  soulName?: string;
  /** A Soulweaver soul coordinate, resolved by the API at answer time. */
  soulRef?: { chainId: number; address: string; tokenId: string } | null;
  /** MOCA API base the guide asks for answers. */
  apiUrl?: string;
  /** Speak answers aloud in-world via Venice TTS (default true). */
  speak?: boolean;
  /** TTS voice id (Venice). Empty → the API's default voice. */
  voice?: string;
  /** Meters one builder tile maps to in-world — MUST match the value the rooms
   * were (or will be) spawned at (the dialog's "Room size", default 16). The
   * guide bakes the room footprints + spatial map at this scale; a mismatch
   * makes the guide mis-resolve which room/work the visitor is at. */
  tileMeters?: number;
}

export async function buildGuideHyp(
  exhibition: HyperfyExhibition,
  guide: GuideHypOptions,
): Promise<{ blob: Blob; filename: string; registration: GuideRegistration }> {
  const apiUrl = (guide.apiUrl || DEFAULT_GUIDE_API).replace(/\/+$/, "");
  const guideName = guide.name || "Oblak";
  const decc0Id = guide.decc0Id || 2875;
  const tileMeters = guide.tileMeters ?? 16;

  const registration = await registerGuideExhibition(exhibition, apiUrl, tileMeters);

  const vrmRes = await fetch(guide.avatarUrl);
  if (!vrmRes.ok) throw new Error(`Guide avatar unreachable (${vrmRes.status})`);
  const vrmBytes = await vrmRes.arrayBuffer();
  const avatarAssetUrl = await hypAssetUrl(vrmBytes, "vrm");

  const scriptBytes = new TextEncoder().encode(
    generateGuideScript({
      exhibitionId: registration.id,
      exhibitionName: exhibition.name,
      apiUrl,
      guideName,
      decc0Id,
      customSoul: guide.customSoul,
      soulName: guide.soulName,
      soulRef: guide.soulRef,
      suggestions: registration.suggestions,
      roomCount: registration.counts.rooms,
      artworkCount: registration.counts.artworks,
      avatarUrl: avatarAssetUrl,
      speak: guide.speak !== false,
      voice: guide.voice,
      // World map of rooms + hung works at the SAME tile scale the footprints
      // were registered at above — so a dropped .hyp guide resolves rooms/works
      // correctly beside an exhibition spawned at this Room size.
      spatialMap: buildGuideSpatialMap(exhibition, tileMeters),
    }),
  );
  const scriptAssetUrl = await hypAssetUrl(scriptBytes, "js");

  const blueprint = {
    id: randomUuid(), // replaced by the engine on drop
    version: 0,
    name: "MOCA · Museum Guide",
    author: "Museum of Crypto Art",
    url: "https://museumofcryptoart.com/rooms/world",
    desc: `${guideName} — the AI guide of "${exhibition.name}". Hold E to talk.`,
    image: null,
    // The bundled .vrm renders as the app's avatar node; the script grabs it
    // (app.get('avatar')) to animate it. (model:null would crash App.build.)
    model: avatarAssetUrl,
    script: scriptAssetUrl,
    props: {
      guideName,
      decc0: decc0Id,
      customSoul: guide.customSoul || "",
      apiUrl,
      exhibitionId: registration.id,
      exhibitionName: exhibition.name,
      avatarUrl: avatarAssetUrl,
      speak: guide.speak !== false,
      voice: guide.voice || "",
    },
    preload: false,
    public: false,
    locked: false,
    frozen: false,
    unique: false,
    scene: false,
    disabled: false,
  };

  const blob = buildHyp({
    blueprint,
    assets: [
      { type: "avatar", url: avatarAssetUrl, bytes: vrmBytes, mime: "model/gltf-binary" },
      { type: "script", url: scriptAssetUrl, bytes: scriptBytes, mime: "text/javascript" },
    ],
  });

  const slug = (exhibition.name || "exhibition").replace(/[^\w-]+/g, "-").toLowerCase();
  return { blob, filename: `${slug}-guide.hyp`, registration };
}

/** Hand the .hyp to the curator as a download (device-local). */
export function downloadGuideHyp(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
