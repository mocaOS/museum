/**
 * Shared slot machinery for the room-GLB pipeline scripts
 * (embed-room-slots.ts, bake-slot-data.ts).
 *
 * The generation algorithm is a 1:1 port of
 * `apps/museum/src/components/museum/three/auto-slots.ts` (same seed = room
 * id), so generated slots land exactly where the builder's runtime fallback
 * previews them. Keep the two in sync if you change either.
 */

import { type Document, type Node } from "@gltf-transform/core";
import * as THREE from "three";

export const SLOT_NAME = /slot[_\s-]*(\d+)/i;
export const PLACEHOLDER_MAT = /slot\s*placeholder/i;

export interface GeneratedSlot {
  id: string;
  index: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  width: number;
  height: number;
}

/** Deterministic 32-bit PRNG (mulberry32). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Candidate {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  score: number;
}

export interface Surface {
  tris: Float32Array;
  cumArea: Float64Array;
  totalArea: number;
  bbox: THREE.Box3;
}

/**
 * Triangle soup in scene-root space, from the glTF document (world transforms
 * applied). Pass `skipNode` to exclude subtrees (e.g. slot placeholder quads).
 */
export function collectSurface(
  doc: Document,
  skipNode?: (node: Node) => boolean,
): Surface | null {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return null;
  const chunks: number[] = [];
  const v = new THREE.Vector3();
  const m = new THREE.Matrix4();
  scene.traverse((node) => {
    if (skipNode?.(node)) return;
    const mesh = node.getMesh();
    if (!mesh) return;
    m.fromArray(node.getWorldMatrix());
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4 /* TRIANGLES */) continue;
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const idx = prim.getIndices();
      const triCount = idx ? idx.getCount() / 3 : pos.getCount() / 3;
      const el: number[] = [];
      for (let t = 0; t < triCount; t++) {
        for (let c = 0; c < 3; c++) {
          const vi = idx ? idx.getScalar(t * 3 + c) : t * 3 + c;
          pos.getElement(vi, el);
          v.set(el[0], el[1], el[2]).applyMatrix4(m);
          chunks.push(v.x, v.y, v.z);
        }
      }
    }
  });
  if (!chunks.length) return null;

  const tris = new Float32Array(chunks);
  const n = tris.length / 9;
  const cumArea = new Float64Array(n);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const bbox = new THREE.Box3();
  let total = 0;
  for (let i = 0; i < n; i++) {
    a.fromArray(tris, i * 9);
    b.fromArray(tris, i * 9 + 3);
    c.fromArray(tris, i * 9 + 6);
    bbox.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    total += ab.cross(ac).length() / 2;
    cumArea[i] = total;
  }
  if (total <= 0) return null;
  return { tris, cumArea, totalArea: total, bbox };
}

function findTri(cumArea: Float64Array, r: number): number {
  let lo = 0;
  let hi = cumArea.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cumArea[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Upright orientation: local +Z along `normal`, +Y as close to world up as the surface allows. */
export function surfaceOrientation(normal: THREE.Vector3): THREE.Quaternion {
  const z = normal.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y);
  if (up.lengthSq() < 1e-4) up.set(0, 0, 1).addScaledVector(z, -z.z);
  up.normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, up, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/**
 * Deterministic surface-sampled slot generation (un_MUSEUMs). `idPrefix` is
 * "Slot_" when the slots get embedded as GLB nodes (embed-room-slots.ts) and
 * "Auto_" when describing the builder's runtime fallback (bake-slot-data.ts on
 * rooms without a model_optimized — runtime ids must match for saved exhibits).
 */
export function generateSlots(
  surface: Surface,
  count: number,
  seed: number,
  idPrefix = "Slot_",
): GeneratedSlot[] {
  if (count <= 0) return [];
  const { tris, cumArea, totalArea, bbox } = surface;

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const frame = THREE.MathUtils.clamp(
    Math.sqrt(totalArea / (count * 14)),
    0.05 * maxDim,
    0.13 * maxDim,
  );

  const rand = mulberry32((seed * 2654435761) ^ (count * 97));
  const M = Math.min(2400, Math.max(600, count * 10));
  const candidates: Candidate[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const floorY = bbox.min.y;

  for (let s = 0; s < M; s++) {
    const ti = findTri(cumArea, rand() * totalArea);
    a.fromArray(tris, ti * 9);
    b.fromArray(tris, ti * 9 + 3);
    c.fromArray(tris, ti * 9 + 6);
    let u = rand();
    let w = rand();
    if (u + w > 1) {
      u = 1 - u;
      w = 1 - w;
    }
    const point = new THREE.Vector3()
      .copy(a)
      .addScaledVector(ab.subVectors(b, a), u)
      .addScaledVector(ac.subVectors(c, a), w);
    const normal = new THREE.Vector3().crossVectors(ab, ac);
    if (normal.lengthSq() < 1e-12) continue;
    normal.normalize();

    if (normal.y < -0.6) continue;
    if (point.y < floorY + 0.02 * size.y) continue;
    if (normal.y > 0.85 && point.y < floorY + 0.12 * size.y) continue;

    candidates.push({ point, normal, score: 0 });
  }
  if (!candidates.length) return [];

  const rPatch = frame * 0.6;
  const rPatchSq = rPatch * rPatch;
  for (let i = 0; i < candidates.length; i++) {
    const ci = candidates[i];
    let coherent = 0;
    let clashing = 0;
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const cj = candidates[j];
      if (ci.point.distanceToSquared(cj.point) > rPatchSq) continue;
      const coplanar
        = Math.abs(cj.point.clone().sub(ci.point).dot(ci.normal)) < rPatch * 0.25;
      if (coplanar && ci.normal.dot(cj.normal) > 0.82) coherent++;
      else clashing++;
    }
    ci.score = coherent - 2 * clashing;
  }
  candidates.sort((x, y) => y.score - x.score);

  const picked: Candidate[] = [];
  let minSep = Math.max(frame * 1.4, Math.sqrt(totalArea / count) * 0.55);
  const sepFloor = frame * 0.55;
  while (picked.length < count && minSep >= sepFloor) {
    const minSepSq = minSep * minSep;
    for (const cand of candidates) {
      if (picked.length >= count) break;
      if (picked.includes(cand)) continue;
      if (cand.score < 0 && minSep > sepFloor * 1.5) continue;
      if (picked.some(p => p.point.distanceToSquared(cand.point) < minSepSq)) continue;
      picked.push(cand);
    }
    minSep *= 0.75;
  }

  const centroid = picked
    .reduce((acc, p) => acc.add(p.point), new THREE.Vector3())
    .divideScalar(picked.length || 1);
  picked.sort((p, q) => {
    const ap = Math.atan2(p.point.z - centroid.z, p.point.x - centroid.x);
    const aq = Math.atan2(q.point.z - centroid.z, q.point.x - centroid.x);
    return ap - aq || p.point.y - q.point.y;
  });

  return picked.map((cand, i) => ({
    id: `${idPrefix}${String(i + 1).padStart(3, "0")}`,
    index: i + 1,
    position: cand.point,
    quaternion: surfaceOrientation(cand.normal),
    width: frame,
    height: frame,
  }));
}

/** Count authored slot placeholders in the document (same heuristics as the museum). */
export function countAuthoredSlots(doc: Document): number {
  let n = 0;
  for (const node of doc.getRoot().listNodes()) {
    if (SLOT_NAME.test(node.getName())) {
      n++;
      continue;
    }
    const mats = node
      .getMesh()
      ?.listPrimitives()
      .map(p => p.getMaterial()?.getName() || "");
    if (mats?.some(name => PLACEHOLDER_MAT.test(name))) n++;
  }
  return n;
}
