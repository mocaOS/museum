import * as THREE from "three";

/**
 * A wall slot extracted from a room GLB. Every MOCA room model authored in the
 * pipeline carries `Slot_001 … Slot_NNN` placeholder meshes (material
 * "Slot Placeholder") whose count matches the Directus `rooms.slots` field.
 * Each placeholder is a flat quad on a wall: its transform gives the hang
 * position + orientation, its local bounding box gives the frame dimensions.
 */
export interface RoomSlot {
  /** Stable id from the node name, e.g. "Slot_001". */
  id: string;
  /** 1-based index parsed from the name (for ordering / labels). */
  index: number;
  /** Position relative to the room's cloned scene root. */
  position: THREE.Vector3;
  /** Orientation relative to the room root (plane normal along local +Z). */
  quaternion: THREE.Quaternion;
  /** Frame width in room-local units (before the placement scale). */
  width: number;
  /** Frame height in room-local units. */
  height: number;
  /**
   * True for procedurally generated slots (un_MUSEUMs — no authored
   * placeholders; see auto-slots.ts). Their quaternion already faces outward
   * along the surface normal, so the inward-to-room-center flip must be
   * skipped.
   */
  auto?: boolean;
}

/**
 * One slot as baked into `rooms.slot_data` by `apps/migration/bake-slot-data.ts`
 * — the publicly served JSON (Directus `/items/rooms`, `/v1/rooms/:id/slots`).
 * Same room-local frame as `RoomSlot`; the quaternion is already
 * facing-resolved and re-levelled, so consumers hang works on it verbatim.
 */
export interface BakedSlot {
  id: string;
  index: number;
  /** "authored" = Slot_NNN node in the GLB; "generated" = surface-sampled. */
  source: "authored" | "generated";
  position: [number, number, number];
  quaternion: [number, number, number, number];
  width: number;
  height: number;
  /** Resolved facing direction (unit vector, room-local). */
  facing: [number, number, number];
  /** True when the authored normal pointed into the wall and was flipped. */
  flipped: boolean;
  /** True when the clearance probe was inconclusive (interior tie-break used). */
  ambiguous: boolean;
}

/** The `rooms.slot_data` JSON document. */
export interface RoomSlotData {
  version: 1;
  room: number;
  /** Directus file id of the GLB the slots were computed from. */
  model: string;
  generated_at: string;
  slots: BakedSlot[];
}

/** Rehydrate baked JSON slots into the builder's runtime shape. */
export function bakedToRoomSlots(data: RoomSlotData): RoomSlot[] {
  return data.slots.map(s => ({
    id: s.id,
    index: s.index,
    position: new THREE.Vector3(...s.position),
    quaternion: new THREE.Quaternion(...s.quaternion),
    width: s.width,
    height: s.height,
    auto: s.source === "generated",
  }));
}

const SLOT_NAME = /slot[_\s-]*(\d+)/i;
const PLACEHOLDER_MAT = /slot\s*placeholder/i;

/** True for the placeholder meshes we replace with hung artworks. */
export function isSlotNode(obj: THREE.Object3D): boolean {
  if (SLOT_NAME.test(obj.name)) return true;
  const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
  return !!mat && PLACEHOLDER_MAT.test((mat as { name?: string }).name || "");
}

/**
 * Walk a freshly-cloned room scene (at identity, before any placement scale)
 * and pull out its slots. Returns them sorted by index. The caller renders an
 * artwork plane at each slot's transform and hides the placeholder mesh.
 */
export function extractSlots(root: THREE.Object3D): RoomSlot[] {
  root.updateMatrixWorld(true);
  const slots: RoomSlot[] = [];
  const seen = new Set<string>();

  root.traverse((obj) => {
    if (!isSlotNode(obj)) return;
    const m = SLOT_NAME.exec(obj.name);
    const id = obj.name || `Slot_${slots.length + 1}`;
    if (seen.has(id)) return;
    seen.add(id);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    obj.matrixWorld.decompose(position, quaternion, scale);

    // Frame size = local geometry bbox (the placeholder quad) × world scale.
    let width = 2;
    let height = 2;
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (bb) {
        const size = new THREE.Vector3();
        bb.getSize(size);
        // The quad's two largest local extents are the frame's W and H; the
        // third (near-zero thickness) is the wall normal axis.
        const dims = [ size.x, size.y, size.z ].sort((a, b) => b - a);
        width = dims[0] * scale.x;
        height = dims[1] * scale.y;
      }
    }

    slots.push({
      id,
      index: m ? Number(m[1]) : slots.length + 1,
      position,
      quaternion,
      width: width || 2,
      height: height || 2,
    });
  });

  slots.sort((a, b) => a.index - b.index);
  return slots;
}

/** Hide (or reveal) the placeholder quads inside a cloned room scene. */
export function setPlaceholdersVisible(root: THREE.Object3D, visible: boolean) {
  root.traverse((obj) => {
    if (isSlotNode(obj)) obj.visible = visible;
  });
}

/**
 * Fit a work of aspect ratio `ratio` (w/h) inside a `frameW × frameH` slot,
 * preserving the artwork's proportions (letterboxed within the frame). This is
 * what makes a portrait piece render tall-and-narrow and a landscape piece
 * wide-and-short within the same wall slot.
 */
export function fitToFrame(
  ratio: number,
  frameW: number,
  frameH: number,
): { width: number; height: number } {
  const r = ratio > 0 ? ratio : 1;
  const frameRatio = frameW / frameH;
  if (r >= frameRatio) {
    return { width: frameW, height: frameW / r };
  }
  return { width: frameH * r, height: frameH };
}
