/**
 * Minimal Hyperfy v2 wire-protocol client.
 *
 * Speaks just enough of the engine's WebSocket protocol to inject content as
 * a builder: connect anonymously, claim admin via the world's admin code (its
 * "API key"), and send blueprint/entity packets. No Hyperfy checkout or
 * node-client build required — `msgpackr` + `ws` is the whole footprint.
 *
 * Wire format (pinned to hyperfy v0.16.0 `src/core/packets.js`): every
 * message is `msgpackr.pack([packetId, data])` where packetId is the POSITION
 * of the packet name in the array below. If Hyperfy reorders or extends that
 * array in a future release, update this table to match.
 *
 * KEEP IN SYNC with apps/museum/src/lib/museum/hyperfy/protocol.ts — the
 * browser twin used by the world builder's "Spawn to Hyperfy" dialog.
 */

import crypto from "node:crypto";
import { Packr } from "msgpackr";
import WebSocket from "ws";

// hyperfy v0.16.0 src/core/packets.js — order is the protocol.
const PACKET_NAMES = [
  "snapshot",
  "command",
  "chatAdded",
  "chatCleared",
  "blueprintAdded",
  "blueprintModified",
  "entityAdded",
  "entityModified",
  "entityEvent",
  "entityRemoved",
  "playerTeleport",
  "playerPush",
  "playerSessionAvatar",
  "liveKitLevel",
  "mute",
  "settingsModified",
  "spawnModified",
  "modifyRank",
  "kick",
  "ai",
  "ping",
  "pong",
];

const ID_BY_NAME = new Map(PACKET_NAMES.map((n, i) => [n, i]));
const packr = new Packr({ structuredClone: true }); // must match the engine's Packr options

export function writePacket(name, data) {
  const id = ID_BY_NAME.get(name);
  if (id === undefined) throw new Error(`Unknown packet: ${name}`);
  return packr.pack([id, data]);
}

export function readPacket(buffer) {
  const [id, data] = packr.unpack(buffer);
  return [PACKET_NAMES[id] ?? `unknown:${id}`, data];
}

/** Normalize the snapshot's blueprints/entities (array of datas) to a Map by id. */
function toMapById(value) {
  const map = new Map();
  const items = Array.isArray(value) ? value : value ? Object.values(value) : [];
  for (const item of items) {
    if (item && item.id) map.set(item.id, item);
  }
  return map;
}

/**
 * One live connection to a world. Always connects WITHOUT an auth token: the
 * server then mints a fresh anonymous user at rank 0, so the admin command —
 * which TOGGLES rank on the engine side — always promotes, never demotes.
 */
export class HyperfySession {
  constructor(ws, snapshot) {
    this.ws = ws;
    this.snapshot = snapshot;
    this.blueprints = toMapById(snapshot.blueprints);
    this.entities = toMapById(snapshot.entities);
    this.hasAdminCode = !!snapshot.hasAdminCode;
    this.chat = [];
    this.closed = false;
  }

  static connect({ url, name = "MOCA Spawner", timeoutMs = 15000 }) {
    const base = url.replace(/\/+$/, "");
    const wsUrl
      = base.replace(/^http/, "ws") + `/ws?name=${encodeURIComponent(name)}`;
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let session = null;
      const timer = setTimeout(() => {
        if (!session) {
          ws.terminate();
          reject(new Error(`Timed out waiting for the world snapshot (${base}). Is this a Hyperfy v2 world?`));
        }
      }, timeoutMs);
      ws.binaryType = "nodebuffer";
      ws.on("message", (buf) => {
        let packet;
        try {
          packet = readPacket(buf);
        } catch {
          return; // not fatal — ignore frames we can't parse
        }
        const [pname, data] = packet;
        if (pname === "snapshot" && !session) {
          clearTimeout(timer);
          session = new HyperfySession(ws, data);
          resolve(session);
        } else if (session) {
          if (pname === "chatAdded") session.chat.push(data);
          if (pname === "blueprintAdded" && data?.id) session.blueprints.set(data.id, data);
          if (pname === "entityAdded" && data?.id) session.entities.set(data.id, data);
          if (pname === "kick") session.kicked = data;
        }
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        if (!session) reject(new Error(`WebSocket failed for ${wsUrl}: ${err.message}`));
      });
      ws.on("close", () => {
        clearTimeout(timer);
        if (session) session.closed = true;
        else reject(new Error(`Connection closed before snapshot (${wsUrl})`));
      });
    });
  }

  send(name, data) {
    if (this.closed) throw new Error("Session closed");
    this.ws.send(writePacket(name, data));
  }

  /**
   * Claim admin rank with the world's admin code. The engine replies with a
   * chat confirmation; we wait briefly so subsequent builder packets land
   * after the rank change is applied server-side.
   */
  async grantAdmin(code) {
    this.send("command", { args: ["admin", code] });
    await new Promise((r) => setTimeout(r, 900));
    if (this.kicked) throw new Error(`Kicked while claiming admin: ${JSON.stringify(this.kicked)}`);
  }

  close() {
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      /* noop */
    }
  }
}

/**
 * Content-addressed asset upload, exactly like the engine's own client:
 * filename = sha256(bytes) + ext, skipped when the world already has it.
 * Returns the `asset://` url blueprints reference.
 */
export async function uploadAsset({ baseUrl, bytes, ext, mime }) {
  const base = baseUrl.replace(/\/+$/, "");
  const hash = crypto.createHash("sha256").update(bytes).digest("hex");
  const filename = `${hash}.${ext}`;
  const check = await fetch(`${base}/api/upload-check?filename=${filename}`);
  if (check.ok) {
    const { exists } = await check.json();
    if (exists) return `asset://${filename}`;
  }
  const form = new FormData();
  form.append("file", new File([bytes], filename, { type: mime }));
  const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status}) for ${filename}`);
  return `asset://${filename}`;
}

/**
 * Deterministic v5-style UUID from a stable key, so re-spawning the same
 * exhibition addresses the same blueprints/entities (updates, not duplicates).
 */
export async function deterministicUuid(key) {
  const hash = crypto.createHash("sha1").update(`moca-hyperfy:${key}`).digest();
  const b = Uint8Array.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const yawToQuaternion = (y) => [0, Math.sin(y / 2), 0, Math.cos(y / 2)];
