/**
 * Build a Hyperfy `.hyp` app file — the single-file bundle the engine's
 * drag-and-drop importer understands (drop it into any world in build mode
 * and the app spawns at the cursor, assets included).
 *
 * Byte layout (mirrors hyperfy v0.16.0 `src/core/extras/appTools.js`
 * exportApp/importApp — still current per docs.hyperfy.xyz):
 *
 *   [uint32 LE header size][JSON header][asset bytes, in header order]
 *   header = { blueprint, assets: [{ type, url, size, mime }] }
 *
 * Asset urls are content-addressed (`asset://<sha256>.<ext>`) exactly like
 * live uploads, so the engine stores them under the same names either way.
 *
 * KEEP IN SYNC with apps/hyperfy/lib/hyp.mjs — the CLI twin used by
 * build-guide-app.mjs.
 */

import { sha256Hex } from "./hash";

export interface HypAsset {
  /** Engine asset kind: 'avatar' | 'model' | 'script' | 'texture' | … */
  type: string;
  /** `asset://<sha256>.<ext>` — also referenced from the blueprint. */
  url: string;
  bytes: ArrayBuffer | Uint8Array;
  mime: string;
}

function byteLength(b: ArrayBuffer | Uint8Array) {
  return b instanceof Uint8Array ? b.byteLength : b.byteLength;
}

/** Content-addressed asset url for raw bytes, like the engine's own uploads. */
export async function hypAssetUrl(bytes: ArrayBuffer | Uint8Array, ext: string): Promise<string> {
  return `asset://${await sha256Hex(bytes)}.${ext}`;
}

export function buildHyp({ blueprint, assets }: { blueprint: object; assets: HypAsset[] }): Blob {
  const header = {
    blueprint,
    assets: assets.map(a => ({
      type: a.type,
      url: a.url,
      size: byteLength(a.bytes),
      mime: a.mime,
    })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const sizePrefix = new Uint8Array(4);
  new DataView(sizePrefix.buffer).setUint32(0, headerBytes.length, true);
  // Copy into plain ArrayBuffer-backed views so every part is a valid BlobPart.
  const parts: Uint8Array<ArrayBuffer>[] = assets.map(a =>
    (a.bytes instanceof Uint8Array ? a.bytes : new Uint8Array(a.bytes)).slice(),
  );
  return new Blob([ sizePrefix, headerBytes, ...parts ], { type: "application/octet-stream" });
}
