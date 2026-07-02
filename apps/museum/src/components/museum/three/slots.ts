import * as THREE from "three";
import { surfaceOrientation } from "./auto-slots";

/**
 * A wall slot extracted from a room GLB. Every MOCA room model authored in the
 * pipeline carries `Slot_001 … Slot_NNN` placeholder meshes (material
 * "Slot Placeholder") whose count matches the Directus `rooms.slots` field.
 * Each placeholder is a flat quad on a wall: its position gives the hang
 * point, its triangle plane gives the orientation, its in-plane extents give
 * the frame dimensions.
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

/** Triangles sampled per placeholder when measuring its plane (quads have 2). */
const NORMAL_TRI_CAP = 1024;
/** Vertices sampled per placeholder when measuring its frame extents. */
const EXTENT_VERT_CAP = 512;

/**
 * Area-weighted face normal of a placeholder mesh, geometry-local. Placeholder
 * quads are authored with arbitrary local axes across the room catalog (DCC
 * exports leave the plane normal along local +X, +Y or +Z depending on how the
 * quad was modelled), so the node transform alone cannot tell us which way the
 * wall faces — the triangles can. Double-sided placeholders carry opposing
 * face pairs; each triangle is sign-aligned with the running sum so they
 * reinforce instead of cancelling. Sign is arbitrary either way — the
 * clearance probe in slot-facing.ts resolves the viewable side.
 */
function geometryPlaneNormal(geometry: THREE.BufferGeometry): THREE.Vector3 | null {
  const pos = geometry.getAttribute("position");
  if (!pos) return null;
  const index = geometry.getIndex();
  const vertCount = index ? index.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const n = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const tris = Math.min(Math.floor(vertCount / 3), NORMAL_TRI_CAP);
  for (let t = 0; t < tris; t++) {
    const i = t * 3;
    a.fromBufferAttribute(pos, index ? index.getX(i) : i);
    b.fromBufferAttribute(pos, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(pos, index ? index.getX(i + 2) : i + 2);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    if (n.lengthSq() < 1e-12) continue;
    if (sum.dot(n) < 0) n.negate();
    sum.add(n);
  }
  return sum.lengthSq() > 1e-10 ? sum.normalize() : null;
}

/**
 * Frame extents of a placeholder mesh measured in the slot's final upright
 * basis (root space): width along the basis X (horizontal on the wall),
 * height along the basis Y. Immune to node axis conventions and non-uniform
 * scale — it measures the vertices where they actually sit.
 */
function planeExtents(
  geometry: THREE.BufferGeometry,
  matrixWorld: THREE.Matrix4,
  quaternion: THREE.Quaternion,
): { width: number; height: number } | null {
  const pos = geometry.getAttribute("position");
  if (!pos || pos.count === 0) return null;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
  const v = new THREE.Vector3();
  let minR = Number.POSITIVE_INFINITY;
  let maxR = Number.NEGATIVE_INFINITY;
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  const step = Math.max(1, Math.ceil(pos.count / EXTENT_VERT_CAP));
  for (let i = 0; i < pos.count; i += step) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrixWorld);
    const r = v.dot(right);
    const u = v.dot(up);
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
  }
  const width = maxR - minR;
  const height = maxU - minU;
  return width > 1e-6 && height > 1e-6 ? { width, height } : null;
}

/**
 * Walk a freshly-cloned room scene (at identity, before any placement scale)
 * and pull out its slots. Returns them sorted by index. The caller renders an
 * artwork plane at each slot's transform and hides the placeholder mesh.
 *
 * Orientation comes from the placeholder's GEOMETRY (its triangle plane), not
 * from the node's local +Z: room models across the catalog author the quad
 * with the normal along any local axis (e.g. every slot in "Museum of
 * Unlimited Growth ii" has it along +X or +Y after the DCC's −90°-X export
 * rotation), and trusting +Z hung those works twisted 90° into the wall. The
 * measured normal is re-levelled upright via `surfaceOrientation`; which SIDE
 * of the wall it faces is decided later by the clearance probe.
 */
export function extractSlots(root: THREE.Object3D): RoomSlot[] {
  root.updateMatrixWorld(true);
  const slots: RoomSlot[] = [];
  const seen = new Set<string>();
  const normalMatrix = new THREE.Matrix3();

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

    const mesh = obj as THREE.Mesh;
    const localNormal = mesh.geometry ? geometryPlaneNormal(mesh.geometry) : null;
    if (localNormal) {
      const rootNormal = localNormal
        .applyMatrix3(normalMatrix.getNormalMatrix(obj.matrixWorld))
        .normalize();
      quaternion.copy(surfaceOrientation(rootNormal));
    }
    // else: no measurable plane — keep the node quaternion (+Z convention).

    // Frame size: in-plane vertex extents in the slot's upright basis; for
    // degenerate geometry fall back to the local bbox's two largest extents.
    let width = 0;
    let height = 0;
    if (mesh.geometry) {
      const extents = localNormal
        ? planeExtents(mesh.geometry, obj.matrixWorld, quaternion)
        : null;
      if (extents) {
        width = extents.width;
        height = extents.height;
      } else {
        mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox;
        if (bb) {
          const size = new THREE.Vector3();
          bb.getSize(size);
          const dims = [ size.x, size.y, size.z ].sort((a, b) => b - a);
          width = dims[0] * scale.x;
          height = dims[1] * scale.y;
        }
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
