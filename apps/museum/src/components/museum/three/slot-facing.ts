import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import { surfaceOrientation } from "./auto-slots";
import { type RoomSlot, isSlotNode } from "./slots";

/**
 * Slot facing detection — figures out which way each wall slot actually faces
 * by probing the room geometry itself, instead of guessing from the room's
 * bounding-box center (the old `inwardOrientation` heuristic, which broke on
 * pillars, corridor walls, non-convex rooms, and un_MUSEUM sculptures whose
 * embedded slots it flipped into the limb they sit on).
 *
 * For every slot we cast a small fan of rays from points on the slot quad
 * along both sides of its plane normal (`±Z`). A side is *viewable* when the
 * median clearance leaves enough free depth to stand in front of the work.
 * Exactly one viewable side → that's the front. Both or neither (open
 * pavilions, zero-thickness walls the probe tunnels through) → fall back to
 * facing the room interior, which is the legacy behaviour, so ambiguous slots
 * never regress. The final quaternion is re-levelled so works hang upright
 * (`+Z` = facing, `+Y` as close to world up as the wall allows).
 *
 * The same analysis is baked offline into `rooms.slot_data` (public JSON on
 * the API) by `apps/migration/bake-slot-data.ts` — a 1:1 port of this module.
 * Keep the two in sync. At runtime this resolver is only the fallback for
 * rooms whose baked data is missing or stale.
 */

export interface SlotFacing {
  /** Final upright orientation: local +Z points at the viewer. */
  quaternion: THREE.Quaternion;
  /** Resolved facing direction (room-local unit vector). */
  facing: THREE.Vector3;
  /** True when the authored/extracted normal had to be flipped. */
  flipped: boolean;
  /** True when both sides probed open/closed and the interior tie-break decided. */
  ambiguous: boolean;
}

type BvhGeometry = THREE.BufferGeometry & {
  boundsTree?: {
    raycastFirst: (
      ray: THREE.Ray,
      side: THREE.Side
    ) => { point: THREE.Vector3; distance: number } | null;
  };
  computeBoundsTree?: typeof computeBoundsTree;
  disposeBoundsTree?: typeof disposeBoundsTree;
};

interface ProbeMesh {
  geometry: BvhGeometry;
  /** Mesh → room-root transform (and inverse) built from the local matrix chain. */
  matrix: THREE.Matrix4;
  inverse: THREE.Matrix4;
}

interface ProbeScene {
  meshes: ProbeMesh[];
  center: THREE.Vector3;
  maxDim: number;
}

/**
 * Collect the room's solid geometry relative to its root, skipping the slot
 * placeholder quads (they'd shadow every probe at distance ~0). Transforms are
 * composed from local matrices so the result is independent of where the
 * cloned scene currently sits in the r3f graph (matrixWorld would bake in the
 * placement scale once mounted).
 */
function collectProbeScene(root: THREE.Object3D): ProbeScene {
  const meshes: ProbeMesh[] = [];
  const bbox = new THREE.Box3();
  const cornerBox = new THREE.Box3();

  const walk = (obj: THREE.Object3D, parent: THREE.Matrix4) => {
    if (isSlotNode(obj) || !obj.visible) return;
    obj.updateMatrix();
    const matrix = new THREE.Matrix4().multiplyMatrices(parent, obj.matrix);
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute("position")) {
      const geometry = mesh.geometry as BvhGeometry;
      // Lazily share the same bounds trees useRoomBvh builds for pointer
      // events — whoever runs first pays, the refcounting in WorldBuilder
      // still owns disposal.
      if (!geometry.boundsTree) {
        geometry.computeBoundsTree = computeBoundsTree;
        geometry.disposeBoundsTree = disposeBoundsTree;
        geometry.computeBoundsTree();
      }
      meshes.push({ geometry, matrix, inverse: matrix.clone().invert() });
      geometry.computeBoundingBox();
      if (geometry.boundingBox) {
        cornerBox.copy(geometry.boundingBox).applyMatrix4(matrix);
        bbox.union(cornerBox);
      }
    }
    for (const child of obj.children) walk(child, matrix);
  };
  walk(root, new THREE.Matrix4());

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bbox.getSize(size);
  bbox.getCenter(center);
  return { meshes, center, maxDim: Math.max(size.x, size.y, size.z) || 1 };
}

/** Nearest hit distance from `origin` along `dir` (room-local), capped. */
function castClearance(
  scene: ProbeScene,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  eps: number,
  cap: number,
): number {
  const ray = new THREE.Ray();
  const localPoint = new THREE.Vector3();
  let best = cap;
  for (const { geometry, matrix, inverse } of scene.meshes) {
    if (!geometry.boundsTree) continue;
    // Probe in geometry-local space; measure the hit back in room space so
    // non-uniform node scales can't distort distances.
    ray.origin.copy(origin).addScaledVector(dir, eps).applyMatrix4(inverse);
    ray.direction.copy(dir).transformDirection(inverse);
    const hit = geometry.boundsTree.raycastFirst(ray, THREE.DoubleSide);
    if (!hit) continue;
    localPoint.copy(hit.point).applyMatrix4(matrix);
    const d = localPoint.distanceTo(origin);
    if (d < best) best = d;
  }
  return best;
}

function median(values: number[]): number {
  const sorted = [ ...values ].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Median clearance over a fan of rays on one side of the slot plane. */
function sideClearance(
  scene: ProbeScene,
  slot: RoomSlot,
  dir: THREE.Vector3,
  cap: number,
): number {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(slot.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(slot.quaternion);
  const eps = Math.max(Math.max(slot.width, slot.height) * 0.01, scene.maxDim * 1e-4);

  // 5 straight rays across the quad: works half-covered by a prop or with a
  // window behind one corner still read correctly via the median.
  const origins = [
    slot.position,
    slot.position.clone().addScaledVector(right, slot.width * 0.3).addScaledVector(up, slot.height * 0.3),
    slot.position.clone().addScaledVector(right, -slot.width * 0.3).addScaledVector(up, slot.height * 0.3),
    slot.position.clone().addScaledVector(right, slot.width * 0.3).addScaledVector(up, -slot.height * 0.3),
    slot.position.clone().addScaledVector(right, -slot.width * 0.3).addScaledVector(up, -slot.height * 0.3),
  ];
  const clearances = origins.map(o => castClearance(scene, o, dir, eps, cap));

  // 4 tilted rays from the center (~35°): a doorway straight ahead doesn't
  // make a walled-off side look open, and vice versa.
  const TILT = 0.7; // tan(35°)
  for (const t of [
    right.clone().multiplyScalar(TILT),
    right.clone().multiplyScalar(-TILT),
    up.clone().multiplyScalar(TILT),
    up.clone().multiplyScalar(-TILT),
  ]) {
    const tilted = dir.clone().add(t).normalize();
    clearances.push(castClearance(scene, slot.position, tilted, eps, cap));
  }
  return median(clearances);
}

/**
 * Resolve the true facing for each slot. Auto-generated slots (un_MUSEUM
 * runtime fallback) keep their sampled surface normal — it is geometric truth
 * — and are only re-levelled; extracted/authored slots get the full two-sided
 * probe.
 */
export function resolveSlotFacing(
  root: THREE.Object3D,
  slots: RoomSlot[],
): Map<string, SlotFacing> {
  const result = new Map<string, SlotFacing>();
  if (!slots.length) return result;

  const scene = collectProbeScene(root);
  const cap = scene.maxDim * 1.5;

  for (const slot of slots) {
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(slot.quaternion).normalize();

    if (slot.auto) {
      result.set(slot.id, {
        quaternion: slot.quaternion.clone(),
        facing: normal,
        flipped: false,
        ambiguous: false,
      });
      continue;
    }

    // Free depth a viewer needs in front of a work, relative to both the
    // frame and the room scale (GLB units are arbitrary across the catalog).
    const minView = Math.max(Math.max(slot.width, slot.height) * 0.9, scene.maxDim * 0.02);
    const front = sideClearance(scene, slot, normal, cap);
    const back = sideClearance(scene, slot, normal.clone().negate(), cap);
    const frontOpen = front >= minView;
    const backOpen = back >= minView;

    const facing = normal.clone();
    let flipped = false;
    let ambiguous = false;
    if (frontOpen && !backOpen) {
      // authored normal confirmed
    } else if (backOpen && !frontOpen) {
      facing.negate();
      flipped = true;
    } else {
      // Open pavilion / freestanding wall / probe tunnelled a zero-thickness
      // wall: fall back to facing the room interior (legacy behaviour).
      ambiguous = true;
      const toCenter = new THREE.Vector3(
        scene.center.x - slot.position.x,
        0,
        scene.center.z - slot.position.z,
      );
      if (toCenter.lengthSq() > 1e-6 && facing.dot(toCenter) < 0) {
        facing.negate();
        flipped = true;
      }
    }

    result.set(slot.id, {
      quaternion: surfaceOrientation(facing),
      facing,
      flipped,
      ambiguous,
    });
  }
  return result;
}
