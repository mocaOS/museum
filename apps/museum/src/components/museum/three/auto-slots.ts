import * as THREE from "three";
import type { RoomSlot } from "./slots";

/**
 * Default slot generation for rooms whose GLB carries no authored `Slot_NNN`
 * placeholders (the un_MUSEUMs series — organic sculptures minted with a slot
 * *amount* onchain but no slot *positions* in the model). We synthesize hang
 * points directly on the sculpture's surface:
 *
 * 1. Area-weighted sample the mesh surface with a seeded PRNG (deterministic:
 *    the same model + count + seed always yields the same slots, so saved
 *    exhibits and assignments stay valid across reloads).
 * 2. Reject floors, undersides and points hugging the base.
 * 3. Score each candidate by local flatness — neighbours within the frame
 *    radius must be roughly coplanar — so frames land on patches that can
 *    visually carry an artwork, not across ridges or holes.
 * 4. Greedy farthest-point pick with a relaxing separation radius until the
 *    requested count is reached (or the surface is exhausted).
 *
 * Slots face *outward* along the surface normal (no inward-to-room-center
 * flip — these are sculptures, not enclosed rooms), re-levelled so works hang
 * upright on walls and lie "uphill" on slanted limbs.
 */

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

interface Surface {
  /** Flat triangle soup in root-local space: 9 floats per triangle. */
  tris: Float32Array;
  /** Prefix sums of triangle areas (for area-weighted sampling). */
  cumArea: Float64Array;
  totalArea: number;
  bbox: THREE.Box3;
}

function collectSurface(root: THREE.Object3D): Surface | null {
  root.updateMatrixWorld(true);
  const chunks: number[] = [];
  const v = new THREE.Vector3();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.visible || !mesh.geometry) return;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const pos = geo.getAttribute("position");
    if (!pos) return;
    const index = geo.getIndex();
    const triCount = index ? index.count / 3 : pos.count / 3;
    for (let t = 0; t < triCount; t++) {
      for (let c = 0; c < 3; c++) {
        const vi = index ? index.getX(t * 3 + c) : t * 3 + c;
        v.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld);
        chunks.push(v.x, v.y, v.z);
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

/** Binary search the area prefix sums for the triangle containing `r`. */
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
function surfaceOrientation(normal: THREE.Vector3): THREE.Quaternion {
  const z = normal.clone().normalize();
  // Project world up onto the slot plane; on near-horizontal surfaces (works
  // lying on a limb) fall back to a horizontal reference so "up" stays stable.
  const up = new THREE.Vector3(0, 1, 0).addScaledVector(z, -z.y);
  if (up.lengthSq() < 1e-4) up.set(0, 0, 1).addScaledVector(z, -z.z);
  up.normalize();
  const x = new THREE.Vector3().crossVectors(up, z).normalize();
  const m = new THREE.Matrix4().makeBasis(x, up, z);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

export function generateAutoSlots(
  root: THREE.Object3D,
  count: number,
  seed = 1,
): RoomSlot[] {
  if (count <= 0) return [];
  const surface = collectSurface(root);
  if (!surface) return [];
  const { tris, cumArea, totalArea, bbox } = surface;

  const size = new THREE.Vector3();
  bbox.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  // Square frame side: scale with available surface per slot, clamped so works
  // read as artworks (not posters / not stamps) against the structure.
  const frame = THREE.MathUtils.clamp(
    Math.sqrt(totalArea / (count * 14)),
    0.05 * maxDim,
    0.13 * maxDim,
  );

  // --- 1. area-weighted candidate sampling (seeded → deterministic) ---------
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

    // --- 2. rejection filters ---
    if (normal.y < -0.6) continue; // straight undersides
    if (point.y < floorY + 0.02 * size.y) continue; // base rim
    if (normal.y > 0.85 && point.y < floorY + 0.12 * size.y) continue; // floor

    candidates.push({ point, normal, score: 0 });
  }
  if (!candidates.length) return [];

  // --- 3. local flatness score: coplanar, like-facing neighbours ------------
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

  // --- 4. greedy farthest-point selection with relaxing separation ----------
  const picked: Candidate[] = [];
  let minSep = Math.max(frame * 1.4, Math.sqrt(totalArea / count) * 0.55);
  const sepFloor = frame * 0.55;
  while (picked.length < count && minSep >= sepFloor) {
    const minSepSq = minSep * minSep;
    for (const cand of candidates) {
      if (picked.length >= count) break;
      if (picked.includes(cand)) continue;
      if (cand.score < 0 && minSep > sepFloor * 1.5) continue; // ridge-straddlers only as a last resort
      if (picked.some(p => p.point.distanceToSquared(cand.point) < minSepSq)) continue;
      picked.push(cand);
    }
    minSep *= 0.75;
  }

  // Stable, readable numbering: walk around the structure by yaw, bottom-up.
  const centroid = picked
    .reduce((acc, p) => acc.add(p.point), new THREE.Vector3())
    .divideScalar(picked.length || 1);
  picked.sort((p, q) => {
    const ap = Math.atan2(p.point.z - centroid.z, p.point.x - centroid.x);
    const aq = Math.atan2(q.point.z - centroid.z, q.point.x - centroid.x);
    return ap - aq || p.point.y - q.point.y;
  });

  return picked.map((cand, i) => ({
    id: `Auto_${String(i + 1).padStart(3, "0")}`,
    index: i + 1,
    position: cand.point,
    quaternion: surfaceOrientation(cand.normal),
    width: frame,
    height: frame,
    auto: true,
  }));
}
