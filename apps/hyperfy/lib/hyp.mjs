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
 * KEEP IN SYNC with apps/museum/src/lib/museum/hyperfy/hyp.ts — the browser
 * twin used by the world builder's "Download guide app" button.
 */

import crypto from "node:crypto";

/** Content-addressed asset url for raw bytes, like the engine's own uploads. */
export function hypAssetUrl(bytes, ext) {
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  return `asset://${hash}.${ext}`;
}

/**
 * @param {object} opts
 * @param {object} opts.blueprint  blueprint fields (model/script referencing the asset urls)
 * @param {Array<{type:string,url:string,bytes:Buffer|Uint8Array,mime:string}>} opts.assets
 * @returns {Buffer} the .hyp file contents
 */
export function buildHyp({ blueprint, assets }) {
  const header = {
    blueprint,
    assets: assets.map((a) => ({
      type: a.type,
      url: a.url,
      size: a.bytes.length,
      mime: a.mime,
    })),
  };
  const headerBytes = Buffer.from(JSON.stringify(header), "utf8");
  const sizePrefix = Buffer.alloc(4);
  sizePrefix.writeUInt32LE(headerBytes.length, 0);
  return Buffer.concat([sizePrefix, headerBytes, ...assets.map((a) => Buffer.from(a.bytes))]);
}
