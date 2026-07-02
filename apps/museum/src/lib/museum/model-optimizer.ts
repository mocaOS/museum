import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, prune, textureCompress } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import sharp from "sharp";

/**
 * Hyperfy-safe GLB optimization for exhibition room models.
 *
 * Room GLBs run 5–40 MB and are texture-dominated; a Hyperfy world join
 * downloads every placed room, so they dominate the initial loading time.
 * This shrinks them the only way the pinned engine (v0.16.0) can actually
 * consume:
 *
 * - Textures → WebP, capped at `textureSize` px. Three's stock GLTFLoader
 *   handles EXT_texture_webp natively in every current browser, and the
 *   engine's server-side loader fork fakes WebP support on node
 *   (HYP_WEBP_NODE) so rooms still parse for colliders.
 * - Geometry stays PLAIN float32. The engine registers NO draco/meshopt/KTX2
 *   decoders, and its PhysX trimesh cooking reads `attributes.position.array`
 *   raw — so draco/meshopt GLBs don't load at all and quantized attributes
 *   would cook garbage colliders. Draco INPUTS (e.g. `rooms.model_optimized`,
 *   baked draco+webp for the museum's own viewer) are therefore DECODED here
 *   and re-written uncompressed — without this, routing an optimized museum
 *   model into Hyperfy would hard-fail in the world.
 * - `dedup` + `prune` drop redundant buffers; node NAMES survive untouched
 *   (`Slot_NNN` lookups in the room script keep working) and `keepLeaves`
 *   preserves empty locator nodes.
 *
 * Normal maps get lossless WebP (lossy chroma subsampling visibly warps
 * shading normals); everything else goes lossy at `quality`.
 */

export interface OptimizeModelResult {
  glb: Buffer;
  /** False when optimization failed and the original bytes came back. */
  optimized: boolean;
  inputBytes: number;
}

const GLB_MAGIC = 0x46546c67; // 'glTF'

let ioPromise: Promise<NodeIO> | null = null;

function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    // Decoder only — we never write draco (the engine can't read it).
    io.registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule() });
    return io;
  })();
  return ioPromise;
}

export function isGlb(bytes: Uint8Array): boolean {
  return bytes.byteLength > 12 && new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) === GLB_MAGIC;
}

export async function optimizeModel(
  input: Uint8Array,
  { textureSize = 1024, quality = 80 }: { textureSize?: number; quality?: number } = {},
): Promise<OptimizeModelResult> {
  const inputBytes = input.byteLength;
  try {
    if (!isGlb(input)) throw new Error("not a GLB");
    const io = await getIO();
    const doc = await io.readBinary(input);

    // Geometry compression was decoded on read; drop the extensions so the
    // output is plain (the Hyperfy engine has no decoders registered).
    let hadGeometryCompression = false;
    for (const ext of doc.getRoot().listExtensionsUsed()) {
      if (
        ext.extensionName === "KHR_draco_mesh_compression"
        || ext.extensionName === "EXT_meshopt_compression"
      ) {
        hadGeometryCompression = true;
        ext.dispose();
      }
    }

    await doc.transform(
      dedup(),
      prune({ keepLeaves: true }),
      // Lossy WebP for color-ish maps…
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        quality,
        resize: [ textureSize, textureSize ],
        slots: /^(?!normalTexture)/,
      }),
      // …lossless WebP for normal maps (lossy warps shading).
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        lossless: true,
        resize: [ textureSize, textureSize ],
        slots: /^normalTexture$/,
      }),
    );

    const out = Buffer.from(await io.writeBinary(doc));
    // A GLB that was already lean (or already webp) can come out marginally
    // bigger from re-encoding — never ship a regression. EXCEPTION:
    // draco/meshopt inputs must ship decoded even when bigger, or the engine
    // can't load them at all.
    if (out.byteLength >= inputBytes && !hadGeometryCompression) {
      return { glb: Buffer.from(input), optimized: false, inputBytes };
    }
    return { glb: out, optimized: true, inputBytes };
  } catch {
    return { glb: Buffer.from(input), optimized: false, inputBytes };
  }
}
