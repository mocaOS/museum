/**
 * Bake per-room slot data (anchors + resolved facing) into `rooms.slot_data`
 * — the public JSON consumed by the exhibition builder and served on the MOCA
 * API (`GET /v1/rooms/:id/slots`, and as a field via the public Directus read
 * policy on `rooms`).
 *
 * For every room this script loads the GLB the builder loads
 * (`model_optimized ?? model`), extracts its `Slot_NNN` placeholders (or
 * generates `Auto_NNN` slots exactly like the builder's runtime fallback —
 * shared algorithm in ./slot-gen.ts), and resolves which side of the wall
 * each slot actually faces by probing the room geometry with a fan of rays on
 * both sides of the slot plane: the side with enough free depth to stand and
 * view a work is the front. The facing logic is a 1:1 port of
 * `apps/museum/src/components/museum/three/slot-facing.ts` — keep the two in
 * sync.
 *
 * Usage:
 *   npx tsx bake-slot-data.ts                  # dry-run: writes ./out-slot-data/*.json
 *   npx tsx bake-slot-data.ts --room 3         # single room
 *   npx tsx bake-slot-data.ts --write          # write rooms.slot_data (creates the field)
 *   npx tsx bake-slot-data.ts --write --force  # re-bake rooms whose data is already fresh
 *   options: --out ./out-slot-data
 *
 * Env: DIRECTUS_API_KEY_DEV (admin static token, only needed for --write).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO, type Document, type Node } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  createDirectus,
  createField,
  readFieldsByCollection,
  readItems,
  rest,
  staticToken,
  updateItem,
} from "@directus/sdk";
import draco3d from "draco3dgltf";
import dotenv from "dotenv";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import {
  PLACEHOLDER_MAT,
  SLOT_NAME,
  type Surface,
  collectSurface,
  generateSlots,
  surfaceOrientation,
} from "./slot-gen";
import type { CustomDirectusTypes, Rooms } from "./types";

dotenv.config();

const DIRECTUS_URL = process.env.DIRECTUS_URL || "https://api.moca.qwellco.de";
const API_KEY = process.env.DIRECTUS_API_KEY_DEV;
const base = createDirectus<CustomDirectusTypes>(DIRECTUS_URL);
const client = (API_KEY ? base.with(staticToken(API_KEY)) : base).with(rest());

// ------------------------------------------------------------------ args ----
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, fallback: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const WRITE = flag("write");
const FORCE = flag("force");
const ONLY_ROOM = opt("room", "");
const OUT_DIR = path.resolve(opt("out", "./out-slot-data"));

// ============================================================================
// The public JSON shape — twin of RoomSlotData in
// apps/museum/src/components/museum/three/slots.ts (keep in sync).
// ============================================================================

interface BakedSlot {
  id: string;
  index: number;
  source: "authored" | "generated";
  position: [number, number, number];
  quaternion: [number, number, number, number];
  width: number;
  height: number;
  facing: [number, number, number];
  flipped: boolean;
  ambiguous: boolean;
}

interface RoomSlotData {
  version: 1;
  room: number;
  model: string;
  generated_at: string;
  slots: BakedSlot[];
}

// ============================================================================
// Slot extraction from the glTF document (mirror of the museum's extractSlots)
// ============================================================================

interface ExtractedSlot {
  id: string;
  index: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  width: number;
  height: number;
  source: "authored" | "generated";
}

function isSlotNode(node: Node): boolean {
  if (SLOT_NAME.test(node.getName())) return true;
  const mats = node
    .getMesh()
    ?.listPrimitives()
    .map(p => p.getMaterial()?.getName() || "");
  return !!mats?.some(name => PLACEHOLDER_MAT.test(name));
}

function extractSlots(doc: Document): ExtractedSlot[] {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  if (!scene) return [];
  const slots: ExtractedSlot[] = [];
  const seen = new Set<string>();

  scene.traverse((node) => {
    if (!isSlotNode(node)) return;
    const m = SLOT_NAME.exec(node.getName());
    const id = node.getName() || `Slot_${slots.length + 1}`;
    if (seen.has(id)) return;
    seen.add(id);

    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    new THREE.Matrix4().fromArray(node.getWorldMatrix()).decompose(position, quaternion, scale);

    // Frame size = local geometry bbox (the placeholder quad) × world scale.
    let width = 2;
    let height = 2;
    const prims = node.getMesh()?.listPrimitives() ?? [];
    const bbMin = new THREE.Vector3(Infinity, Infinity, Infinity);
    const bbMax = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
    let hasBox = false;
    for (const prim of prims) {
      const pos = prim.getAttribute("POSITION");
      if (!pos) continue;
      const mn = pos.getMin([0, 0, 0]);
      const mx = pos.getMax([0, 0, 0]);
      bbMin.min(new THREE.Vector3(mn[0], mn[1], mn[2]));
      bbMax.max(new THREE.Vector3(mx[0], mx[1], mx[2]));
      hasBox = true;
    }
    if (hasBox) {
      const size = new THREE.Vector3().subVectors(bbMax, bbMin);
      const dims = [size.x, size.y, size.z].sort((a, b) => b - a);
      width = dims[0] * scale.x;
      height = dims[1] * scale.y;
    }

    slots.push({
      id,
      index: m ? Number(m[1]) : slots.length + 1,
      position,
      quaternion,
      width: width || 2,
      height: height || 2,
      source: "authored",
    });
  });

  slots.sort((a, b) => a.index - b.index);
  return slots;
}

// ============================================================================
// Facing resolution — 1:1 port of apps/museum/.../slot-facing.ts (keep in sync)
// ============================================================================

interface ProbeScene {
  bvh: MeshBVH;
  center: THREE.Vector3;
  maxDim: number;
}

function buildProbeScene(surface: Surface): ProbeScene {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(surface.tris, 3));
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  surface.bbox.getSize(size);
  surface.bbox.getCenter(center);
  return {
    bvh: new MeshBVH(geometry),
    center,
    maxDim: Math.max(size.x, size.y, size.z) || 1,
  };
}

function castClearance(
  scene: ProbeScene,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  eps: number,
  cap: number,
): number {
  const ray = new THREE.Ray(origin.clone().addScaledVector(dir, eps), dir.clone());
  const hit = scene.bvh.raycastFirst(ray, THREE.DoubleSide);
  if (!hit) return cap;
  return Math.min(eps + hit.distance, cap);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function sideClearance(
  scene: ProbeScene,
  slot: ExtractedSlot,
  dir: THREE.Vector3,
  cap: number,
): number {
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(slot.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(slot.quaternion);
  const eps = Math.max(Math.max(slot.width, slot.height) * 0.01, scene.maxDim * 1e-4);

  const origins = [
    slot.position,
    slot.position.clone().addScaledVector(right, slot.width * 0.3).addScaledVector(up, slot.height * 0.3),
    slot.position.clone().addScaledVector(right, -slot.width * 0.3).addScaledVector(up, slot.height * 0.3),
    slot.position.clone().addScaledVector(right, slot.width * 0.3).addScaledVector(up, -slot.height * 0.3),
    slot.position.clone().addScaledVector(right, -slot.width * 0.3).addScaledVector(up, -slot.height * 0.3),
  ];
  const clearances = origins.map(o => castClearance(scene, o, dir, eps, cap));

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

function resolveFacing(
  scene: ProbeScene,
  slot: ExtractedSlot,
): { quaternion: THREE.Quaternion; facing: THREE.Vector3; flipped: boolean; ambiguous: boolean } {
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(slot.quaternion).normalize();

  // Generated slots keep their sampled surface normal — geometric truth.
  if (slot.source === "generated") {
    return { quaternion: slot.quaternion.clone(), facing: normal, flipped: false, ambiguous: false };
  }

  const cap = scene.maxDim * 1.5;
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

  return { quaternion: surfaceOrientation(facing), facing, flipped, ambiguous };
}

// ============================================================================
// Directus plumbing
// ============================================================================

/** Make sure rooms.slot_data (json field) exists. */
async function ensureField(): Promise<void> {
  const fields = await client.request(readFieldsByCollection("rooms"));
  if (fields.some((f: { field: string }) => f.field === "slot_data")) return;
  console.log("Creating rooms.slot_data field…");
  await client.request(
    createField("rooms", {
      field: "slot_data",
      type: "json",
      meta: {
        interface: "input-code",
        options: { language: "JSON" },
        special: ["cast-json"],
        note:
          "Baked slot anchors + resolved facing for the room's builder GLB " +
          "(model_optimized ?? model). Generated by apps/migration/bake-slot-data.ts — " +
          "do not edit by hand. Served publicly (read policy + GET /v1/rooms/:id/slots).",
      },
      schema: {},
    } as never),
  );
}

// ============================================================================
// main
// ============================================================================

async function main() {
  if (WRITE && !API_KEY) {
    console.error("--write needs DIRECTUS_API_KEY_DEV in env (admin static token).");
    process.exit(1);
  }

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });

  mkdirSync(OUT_DIR, { recursive: true });

  // model_optimized / slot_data may not exist yet — fall back progressively.
  const fetchRooms = async (extras: string[]) =>
    (await client.request(
      readItems("rooms", {
        fields: ["id", "title", "series", "slots", "model", "token_id", ...extras] as never,
        sort: ["id"] as never,
        limit: -1,
      }),
    )) as (Rooms & { model_optimized?: string | null; slot_data?: RoomSlotData | null })[];

  let rooms: Awaited<ReturnType<typeof fetchRooms>>;
  try {
    rooms = await fetchRooms(["model_optimized", "slot_data"]);
  } catch {
    try {
      rooms = await fetchRooms(["model_optimized"]);
    } catch {
      rooms = await fetchRooms([]);
    }
  }

  if (WRITE) await ensureField();

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const room of rooms) {
    if (ONLY_ROOM && String(room.id) !== ONLY_ROOM) continue;
    const fileId = (room.model_optimized || room.model || null) as string | null;
    if (!fileId) {
      skipped++;
      continue;
    }
    if (!FORCE && room.slot_data?.version === 1 && room.slot_data.model === fileId) {
      skipped++;
      continue;
    }

    const label = `#${room.id} ${room.title} [${room.series}]`;
    try {
      const res = await fetch(`${DIRECTUS_URL}/assets/${fileId}`);
      if (!res.ok) throw new Error(`model download failed (${res.status})`);
      const doc = await io.readBinary(new Uint8Array(await res.arrayBuffer()));

      // Probe geometry: the room without its slot placeholder quads (they'd
      // shadow every ray at distance ~0).
      const surface = collectSurface(doc, isSlotNode);
      if (!surface) throw new Error("no triangle surface found");
      const scene = buildProbeScene(surface);

      // Slots: authored/embedded Slot_NNN nodes win; otherwise generate the
      // builder's runtime fallback (Auto_NNN, same seed → same anchors).
      let slots = extractSlots(doc);
      if (!slots.length && (room.slots ?? 0) > 0) {
        slots = generateSlots(surface, room.slots!, room.id, "Auto_").map(s => ({
          ...s,
          source: "generated" as const,
        }));
      }
      if (!slots.length) throw new Error("no slots extracted or generated");

      const baked: BakedSlot[] = slots.map((slot) => {
        const f = resolveFacing(scene, slot);
        return {
          id: slot.id,
          index: slot.index,
          source: slot.source,
          position: [slot.position.x, slot.position.y, slot.position.z],
          quaternion: [f.quaternion.x, f.quaternion.y, f.quaternion.z, f.quaternion.w],
          width: slot.width,
          height: slot.height,
          facing: [f.facing.x, f.facing.y, f.facing.z],
          flipped: f.flipped,
          ambiguous: f.ambiguous,
        };
      });

      const data: RoomSlotData = {
        version: 1,
        room: room.id,
        model: fileId,
        generated_at: new Date().toISOString(),
        slots: baked,
      };

      writeFileSync(
        path.join(OUT_DIR, `${room.token_id || room.id}_slot_data.json`),
        JSON.stringify(data, null, 2),
      );

      let note = "";
      if (WRITE) {
        await client.request(updateItem("rooms", room.id, { slot_data: data } as never));
        note = " → written";
      }

      const flipped = baked.filter(s => s.flipped).length;
      const ambiguous = baked.filter(s => s.ambiguous).length;
      console.log(
        `✔ ${label}: ${baked.length} slots (${baked[0].source}), ` +
          `flipped=${flipped} ambiguous=${ambiguous}${note}`,
      );
      done++;
    } catch (e) {
      console.error(`✗ ${label}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\n${WRITE ? "" : "[dry-run] "}done=${done} skipped=${skipped} failed=${failed}` +
      `${WRITE ? "" : ` — JSON in ${OUT_DIR}, rerun with --write to publish`}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
