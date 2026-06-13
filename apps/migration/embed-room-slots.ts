/**
 * Embed artwork slots into room GLBs + produce optimized builder variants.
 *
 * Every MOCA room gets two model versions on the API:
 *   - `model`            — the untouched high-quality GLB (the /rooms/[id] HQ viewer)
 *   - `model_optimized`  — draco-compressed, webp-textured GLB **with embedded
 *                          `Slot_NNN` placeholder quads** (the exhibition
 *                          builder + Hyperfy pipeline)
 *
 * Rooms whose GLB already carries authored `Slot_NNN` placeholders (Genesis,
 * MODs, …) are only optimized. un_MUSEUMs (no authored slots; slot *amount*
 * lives onchain, synced into Directus `rooms.slots`) additionally get slots
 * generated on the sculpture surface — the shared algorithm lives in
 * `./slot-gen.ts` (a 1:1 port of the museum's auto-slots.ts, same seed =
 * room id), so embedded slots land exactly where the builder's runtime
 * fallback previews them today.
 *
 * After (re-)embedding, run `bake-slot-data.ts` to refresh the public
 * `rooms.slot_data` JSON (slot anchors + resolved facing).
 *
 * Usage:
 *   npx tsx embed-room-slots.ts                  # dry-run: writes ./out-rooms, no API writes
 *   npx tsx embed-room-slots.ts --room 3         # single room
 *   npx tsx embed-room-slots.ts --write          # upload + set rooms.model_optimized
 *   npx tsx embed-room-slots.ts --write --force  # redo rooms that already have one
 *   options: --tex-size 1024  --out ./out-rooms
 *
 * Env: DIRECTUS_API_KEY_DEV (admin static token — also used to auto-create the
 * `model_optimized` field + relation on first --write run).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NodeIO, type Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, draco, prune, textureCompress, weld } from "@gltf-transform/functions";
import {
  createDirectus,
  createField,
  createFolder,
  createRelation,
  readFieldsByCollection,
  readFolders,
  readItems,
  rest,
  staticToken,
  updateItem,
  uploadFiles,
} from "@directus/sdk";
import draco3d from "draco3dgltf";
import dotenv from "dotenv";
import sharp from "sharp";
import { type GeneratedSlot, collectSurface, countAuthoredSlots, generateSlots } from "./slot-gen";
import type { CustomDirectusTypes, Rooms } from "./types";

dotenv.config();

const DIRECTUS_URL = process.env.DIRECTUS_URL || "https://api.moca.qwellco.de";
// Rooms are publicly readable — the token is only needed for --write
// (file uploads, field creation, item updates).
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
const TEX_SIZE = Number(opt("tex-size", "1024"));
const OUT_DIR = path.resolve(opt("out", "./out-rooms"));

// ============================================================================
// glTF processing
// ============================================================================

/**
 * Add `Slot_NNN` placeholder quads to the scene — the exact authoring
 * convention the museum's `extractSlots()` reads: a unit XY quad (normal +Z)
 * whose node scale encodes the frame size, material named "Slot Placeholder".
 */
function embedSlots(doc: Document, slots: GeneratedSlot[]) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const buffer = root.listBuffers()[0] ?? doc.createBuffer();

  const pos = doc
    .createAccessor("SlotQuadPosition")
    .setType("VEC3")
    .setArray(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]))
    .setBuffer(buffer);
  const idx = doc
    .createAccessor("SlotQuadIndices")
    .setType("SCALAR")
    .setArray(new Uint16Array([0, 1, 2, 0, 2, 3]))
    .setBuffer(buffer);
  const material = doc
    .createMaterial("Slot Placeholder")
    .setBaseColorFactor([0.37, 0.69, 1, 0.25])
    .setAlphaMode("BLEND")
    .setMetallicFactor(0)
    .setRoughnessFactor(1)
    .setDoubleSided(true);
  const prim = doc.createPrimitive().setAttribute("POSITION", pos).setIndices(idx).setMaterial(material);
  const quadMesh = doc.createMesh("Slot Placeholder Quad").addPrimitive(prim);

  for (const s of slots) {
    const node = doc
      .createNode(s.id)
      .setMesh(quadMesh)
      .setTranslation([s.position.x, s.position.y, s.position.z])
      .setRotation([s.quaternion.x, s.quaternion.y, s.quaternion.z, s.quaternion.w])
      .setScale([s.width, s.height, 1]);
    scene.addChild(node);
  }
}

// ============================================================================
// Directus plumbing
// ============================================================================

/** Make sure rooms.model_optimized (uuid file field + relation) exists. */
async function ensureField(): Promise<void> {
  const fields = await client.request(readFieldsByCollection("rooms"));
  if (fields.some((f: { field: string }) => f.field === "model_optimized")) return;
  console.log("Creating rooms.model_optimized field…");
  await client.request(
    createField("rooms", {
      field: "model_optimized",
      type: "uuid",
      meta: {
        interface: "file",
        special: ["file"],
        note: "Optimized GLB with embedded Slot_NNN placeholders — served to the exhibition builder. `model` stays the untouched HQ version.",
      },
      schema: {},
    } as never),
  );
  try {
    await client.request(
      createRelation({
        collection: "rooms",
        field: "model_optimized",
        related_collection: "directus_files",
      } as never),
    );
  } catch (e) {
    console.warn("Relation create skipped:", (e as Error)?.message);
  }
}

async function getOrCreateFolder(name: string, parentId?: string): Promise<string | null> {
  const folders = await client.request(
    readFolders({
      filter: {
        name: { _eq: name },
        ...(parentId ? { parent: { _eq: parentId } } : { parent: { _null: true } }),
      },
    }),
  );
  if (folders.length > 0) return folders[0].id;
  const created = await client.request(createFolder({ name, ...(parentId && { parent: parentId }) }));
  return created.id;
}

async function uploadGlb(buf: Buffer, filename: string, folderId: string): Promise<string | null> {
  const form = new FormData();
  form.append("folder", folderId);
  form.append("file", new Blob([new Uint8Array(buf)], { type: "model/gltf-binary" }), filename);
  form.append("title", filename.replace(/\.glb$/, ""));
  const result = await client.request(uploadFiles(form));
  return result?.id ?? null;
}

// ============================================================================
// main
// ============================================================================

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

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

  // model_optimized may not exist yet (ensureField creates it on --write) —
  // fall back to querying without it.
  const fetchRooms = async (withOptimized: boolean) =>
    (await client.request(
      readItems("rooms", {
        fields: [
          "id",
          "title",
          "series",
          "slots",
          "model",
          "token_id",
          ...(withOptimized ? ["model_optimized"] : []),
        ] as never,
        sort: ["id"] as never,
        limit: -1,
      }),
    )) as (Rooms & { model_optimized?: string | null })[];

  let rooms: (Rooms & { model_optimized?: string | null })[];
  try {
    rooms = await fetchRooms(true);
  } catch {
    console.log("(rooms.model_optimized not present yet — treating all rooms as unprocessed)");
    rooms = await fetchRooms(false);
  }

  let modelsFolderId: string | null = null;
  if (WRITE) {
    await ensureField();
    const roomsFolder = await getOrCreateFolder("ROOMs");
    modelsFolderId = roomsFolder ? await getOrCreateFolder("Models Optimized", roomsFolder) : null;
    if (!modelsFolderId) throw new Error("Could not resolve the ROOMs/Models Optimized folder");
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const room of rooms) {
    if (ONLY_ROOM && String(room.id) !== ONLY_ROOM) continue;
    if (!room.model) {
      skipped++;
      continue;
    }
    if (room.model_optimized && !FORCE) {
      skipped++;
      continue;
    }

    const label = `#${room.id} ${room.title} [${room.series}]`;
    try {
      const res = await fetch(`${DIRECTUS_URL}/assets/${room.model}`);
      if (!res.ok) throw new Error(`model download failed (${res.status})`);
      const original = Buffer.from(await res.arrayBuffer());

      const doc = await io.readBinary(new Uint8Array(original));
      const authored = countAuthoredSlots(doc);
      let generated = 0;

      if (authored === 0 && (room.slots ?? 0) > 0) {
        const surface = collectSurface(doc);
        if (!surface) throw new Error("no triangle surface found");
        const slots = generateSlots(surface, room.slots!, room.id);
        if (!slots.length) throw new Error("slot generation produced nothing");
        embedSlots(doc, slots);
        generated = slots.length;
      }

      // Optimize: light geometry cleanup + webp textures + draco compression.
      // No flatten/join — named Slot_NNN nodes must survive.
      await doc.transform(
        weld(),
        dedup(),
        prune(),
        textureCompress({ encoder: sharp, targetFormat: "webp", resize: [TEX_SIZE, TEX_SIZE] }),
        draco(),
      );

      const out = Buffer.from(await io.writeBinary(doc));
      const filename = `${room.token_id || room.id}_model_optimized.glb`;
      writeFileSync(path.join(OUT_DIR, filename), out);

      let note = "";
      if (WRITE) {
        const fileId = await uploadGlb(out, filename, modelsFolderId!);
        if (!fileId) throw new Error("upload returned no file id");
        await client.request(updateItem("rooms", room.id, { model_optimized: fileId } as never));
        note = ` → uploaded ${fileId}`;
      }

      console.log(
        `✔ ${label}: slots authored=${authored} generated=${generated} (onchain=${room.slots ?? "—"}), ` +
          `${mb(original.length)} → ${mb(out.length)}${note}`,
      );
      done++;
    } catch (e) {
      console.error(`✗ ${label}: ${(e as Error).message}`);
      failed++;
    }
  }

  console.log(
    `\n${WRITE ? "" : "[dry-run] "}done=${done} skipped=${skipped} failed=${failed}` +
      `${WRITE ? "" : ` — files in ${OUT_DIR}, rerun with --write to upload`}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
