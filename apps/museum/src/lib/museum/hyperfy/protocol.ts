/**
 * Minimal Hyperfy v2 wire-protocol client — browser edition.
 *
 * Speaks just enough of the engine's WebSocket protocol to inject content as
 * a builder: connect anonymously, claim admin via the world's admin code (its
 * "API key"), and send blueprint/entity packets. Used by the world builder's
 * "Spawn to Hyperfy" dialog, so the curator's exhibition travels directly
 * from their browser to the world they chose — it never touches MOCA servers.
 *
 * Wire format (pinned to hyperfy v0.16.0 `src/core/packets.js`): every
 * message is `msgpackr.pack([packetId, data])` where packetId is the POSITION
 * of the packet name in the array below. If Hyperfy reorders or extends that
 * array in a future release, update this table to match.
 *
 * KEEP IN SYNC with apps/hyperfy/lib/protocol.mjs — the node twin behind
 * spawn-exhibition.mjs.
 */

import { Packr } from "msgpackr";
import { sha1Bytes, sha256Hex } from "./hash";

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
] as const;

const ID_BY_NAME = new Map<string, number>(PACKET_NAMES.map((n, i) => [ n, i ]));
const packr = new Packr({ structuredClone: true }); // must match the engine's Packr options

export function writePacket(name: string, data: unknown): Uint8Array {
  const id = ID_BY_NAME.get(name);
  if (id === undefined) throw new Error(`Unknown packet: ${name}`);
  return packr.pack([ id, data ]);
}

export function readPacket(buffer: Uint8Array): [string, unknown] {
  const [ id, data ] = packr.unpack(buffer) as [number, unknown];
  return [ PACKET_NAMES[id] ?? `unknown:${id}`, data ];
}

export interface HyperfyBlueprint {
  id: string;
  version?: number;
  model?: string;
  script?: string;
  [key: string]: unknown;
}

export interface HyperfyEntity {
  id: string;
  [key: string]: unknown;
}

interface Snapshot {
  id?: string;
  blueprints?: unknown;
  entities?: unknown;
  hasAdminCode?: boolean;
  maxUploadSize?: number | string;
}

/** Normalize the snapshot's blueprints/entities (array of datas) to a Map by id. */
function toMapById<T extends { id: string }>(value: unknown): Map<string, T> {
  const map = new Map<string, T>();
  const items = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];
  for (const item of items as T[]) {
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
  ws: WebSocket;
  snapshot: Snapshot;
  blueprints: Map<string, HyperfyBlueprint>;
  entities: Map<string, HyperfyEntity>;
  hasAdminCode: boolean;
  /** Our own player/socket id — lets the spawner move itself (spawn point). */
  selfId: string | undefined;
  kicked: unknown = null;
  closed = false;

  private constructor(ws: WebSocket, snapshot: Snapshot) {
    this.ws = ws;
    this.snapshot = snapshot;
    this.blueprints = toMapById(snapshot.blueprints);
    this.entities = toMapById(snapshot.entities);
    this.hasAdminCode = !!snapshot.hasAdminCode;
    this.selfId = snapshot.id;
  }

  static connect({
    url,
    name = "MOCA World Builder",
    timeoutMs = 15000,
  }: {
    url: string;
    name?: string;
    timeoutMs?: number;
  }): Promise<HyperfySession> {
    const base = url.replace(/\/+$/, "");
    const wsUrl = `${base.replace(/^http/, "ws")}/ws?name=${encodeURIComponent(name)}`;
    return new Promise((resolve, reject) => {
      let session: HyperfySession | null = null;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      ws.binaryType = "arraybuffer";
      const timer = setTimeout(() => {
        if (!session) {
          ws.close();
          reject(new Error("Timed out waiting for the world snapshot. Is this a Hyperfy v2 world URL?"));
        }
      }, timeoutMs);
      ws.onmessage = (ev: MessageEvent) => {
        if (!(ev.data instanceof ArrayBuffer)) return;
        let packet: [string, unknown];
        try {
          packet = readPacket(new Uint8Array(ev.data));
        } catch {
          return; // not fatal — ignore frames we can't parse
        }
        const [ pname, data ] = packet;
        if (pname === "snapshot" && !session) {
          clearTimeout(timer);
          session = new HyperfySession(ws, data as Snapshot);
          resolve(session);
        } else if (session && pname === "kick") {
          session.kicked = data;
        }
      };
      ws.onerror = () => {
        clearTimeout(timer);
        if (!session) {
          reject(new Error("Could not reach the world. Check the URL (and that it's online)."));
        }
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (session) session.closed = true;
        else reject(new Error("Connection closed before the world answered."));
      };
    });
  }

  send(name: string, data: unknown) {
    if (this.closed) throw new Error("Session closed");
    this.ws.send(writePacket(name, data));
  }

  /**
   * Claim admin rank with the world's admin code. The engine replies with a
   * chat confirmation; we wait briefly so subsequent builder packets land
   * after the rank change is applied server-side.
   */
  async grantAdmin(code: string) {
    this.send("command", { args: [ "admin", code ] });
    await new Promise(resolve => setTimeout(resolve, 900));
    if (this.kicked) throw new Error("Kicked while claiming admin rights.");
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
 * Returns the `asset://` url blueprints reference. Hyperfy's HTTP API is
 * CORS-open, so this works straight from the browser.
 */
export async function uploadAsset({
  baseUrl,
  bytes,
  ext,
  mime,
}: {
  baseUrl: string;
  bytes: Uint8Array | ArrayBuffer;
  ext: string;
  mime: string;
}): Promise<string> {
  const base = baseUrl.replace(/\/+$/, "");
  const buf = bytes instanceof ArrayBuffer ? bytes : (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  // hash.ts falls back to pure JS where crypto.subtle doesn't exist (plain
  // http origins) — spawning must work from any self-hosted museum install.
  const hash = await sha256Hex(buf);
  const filename = `${hash}.${ext}`;
  try {
    const check = await fetch(`${base}/api/upload-check?filename=${filename}`);
    if (check.ok) {
      const { exists } = (await check.json()) as { exists?: boolean };
      if (exists) return `asset://${filename}`;
    }
  } catch {
    /* check is an optimization — fall through to upload */
  }
  const form = new FormData();
  form.append("file", new File([ buf ], filename, { type: mime }));
  const res = await fetch(`${base}/api/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`Upload failed (${res.status}) for ${filename}`);
  return `asset://${filename}`;
}

/**
 * Deterministic v5-style UUID from a stable key, so re-spawning the same
 * exhibition addresses the same blueprints/entities (updates, not duplicates).
 */
export async function deterministicUuid(key: string): Promise<string> {
  const data = new TextEncoder().encode(`moca-hyperfy:${key}`);
  const b = (await sha1Bytes(data)).slice(0, 16);
  b[6] = (b[6] & 0x0F) | 0x50; // version 5
  b[8] = (b[8] & 0x3F) | 0x80; // RFC 4122 variant
  const hex = [ ...b ].map(x => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function yawToQuaternion(y: number): [number, number, number, number] {
  return [
    0,
    Math.sin(y / 2),
    0,
    Math.cos(y / 2),
  ];
}
