import { DEFAULT_GUIDE_API, registerGuideExhibition } from "./guide-hyp";
import { generateGuideScript } from "./guide-script";
import {
  HyperfySession,
  deterministicUuid,
  uploadAsset,
  yawToQuaternion,
} from "./protocol";
import { generateRoomScript } from "./room-script";
import type { HyperfyExhibition } from "@/components/museum/three/hyperfy-export";

/**
 * Spawn an exhibition into a Hyperfy v2 world, straight from the browser.
 *
 * Browser-twin of apps/hyperfy/spawn-exhibition.mjs (same ids, same packets,
 * same semantics — keep the behaviors aligned):
 *
 * - MODULAR: each placed room becomes its own pinned Hyperfy app; the
 *   generated script hangs the curated works onto the room's Slot_NNN nodes,
 *   so artworks are child nodes that stay attached to their room forever.
 * - IDEMPOTENT: blueprint/entity ids derive from exhibition id + placement
 *   uid. Re-spawning updates curation in place (blueprint version bump)
 *   while preserving how admins arranged the rooms inside the engine.
 * - PRIVATE: runs entirely on the curator's device — exhibition data flows
 *   browser → chosen world, never through MOCA servers (Hyperfy's HTTP API
 *   is CORS-open; the WebSocket protocol is origin-agnostic).
 */

export type RoomSpawnStatus =
  | "connecting"
  | "model"
  | "artworks"
  | "script"
  | "spawning"
  | "created"
  | "updated"
  | "unchanged"
  | "failed";

export interface SpawnProgress {
  phase: "connect" | "rooms" | "verify" | "done";
  /** Per-placement room state, in exhibition order. */
  rooms: { uid: string; title: string; status: RoomSpawnStatus; error?: string }[];
}

export interface SpawnResult {
  created: number;
  updated: number;
  unchanged: number;
  failed: number;
  artworks: number;
  verified: boolean;
}

export interface GuideOptions {
  /** The guide's display name (default "Tsahafi"). */
  name?: string;
  /** Absolute or site-relative URL of the .vrm the guide embodies. */
  avatarUrl: string;
  /** Art DeCC0 token id whose persona the guide adopts (default 4209, Tsahafi). */
  decc0Id?: number;
  /** A SOUL.md the guide embodies — uploaded by the curator; beats decc0/soulRef. */
  customSoul?: string;
  /** Display name for the custom soul. */
  soulName?: string;
  /** A Soulweaver soul coordinate, resolved by the API at answer time. */
  soulRef?: { chainId: number; address: string; tokenId: string } | null;
  /** MOCA API base the guide asks for answers (default api.moca.qwellco.de). */
  apiUrl?: string;
}

export interface SpawnOptions {
  url: string;
  /** The world's admin key (its ADMIN_CODE). Optional for open worlds. */
  key?: string;
  artSize?: number;
  /**
   * Meters one builder tile maps to (default 16). The builder lays rooms out
   * on 8-unit tiles, each room scaled to fit one — this picks the physical
   * size of that tile in-world; room size and spacing scale together.
   */
  tileMeters?: number;
  /**
   * Lock rooms in place (default false — rooms arrive grabbable, movable and
   * deletable by anyone with build rights; visitors can't touch them either
   * way). P in-world toggles a room's pin.
   */
  pinned?: boolean;
  /** Move already-spawned rooms back to the museum layout. */
  relayout?: boolean;
  /**
   * Also spawn the agentic museum guide (a talking VRM avatar). This is the
   * one step that DOES send exhibition data to MOCA servers: the guide's
   * knowledge — rooms, architects, artists, works — is registered with the
   * MOCA API so it can answer visitor questions.
   */
  guide?: GuideOptions;
  onProgress?: (progress: SpawnProgress) => void;
}

/** Progress-row uid of the guide (it travels with the room list in the UI). */
export const GUIDE_UID = "__guide";

/** Builder tile size in builder units — placement positions are multiples of it. */
const BUILDER_TILE = 8;

export async function spawnExhibition(
  exhibition: HyperfyExhibition,
  {
    url,
    key,
    artSize = 2,
    tileMeters = 16,
    pinned = false,
    relayout = false,
    guide,
    onProgress,
  }: SpawnOptions,
): Promise<SpawnResult> {
  const rooms: SpawnProgress["rooms"] = exhibition.placements.map(p => ({
    uid: p.uid,
    title: p.room.title,
    status: "connecting" as RoomSpawnStatus,
  }));
  if (guide) {
    rooms.push({
      uid: GUIDE_UID,
      title: `Museum guide “${guide.name || "Tsahafi"}”`,
      status: "connecting" as RoomSpawnStatus,
    });
  }
  const report = (phase: SpawnProgress["phase"]) =>
    onProgress?.({ phase, rooms: rooms.map(r => ({ ...r })) });
  const setStatus = (uid: string, status: RoomSpawnStatus, error?: string) => {
    const r = rooms.find(x => x.uid === uid);
    if (r) {
      r.status = status;
      if (error) r.error = error;
    }
    report("rooms");
  };

  report("connect");
  const session = await HyperfySession.connect({ url });
  try {
    if (session.hasAdminCode) {
      if (!key) {
        throw new Error("This world requires an admin key. Ask the world's operator for its ADMIN_CODE.");
      }
      await session.grantAdmin(key);
    }

    const exhibitionKey = exhibition.id || exhibition.name || "default";
    const result: SpawnResult = {
      created: 0,
      updated: 0,
      unchanged: 0,
      failed: 0,
      artworks: 0,
      verified: false,
    };
    const expected: { bpId: string; enId: string; uid: string }[] = [];

    for (const placement of exhibition.placements) {
      try {
        const bpId = await deterministicUuid(`${exhibitionKey}:${placement.uid}:blueprint`);
        const enId = await deterministicUuid(`${exhibitionKey}:${placement.uid}:entity`);

        // Reproduce the builder's tile normalization: scale the room so its
        // footprint spans one tile (tileMeters), recenter it on the tile with
        // the floor at y=0, and convert tile-space positions to meters.
        const k = tileMeters / BUILDER_TILE; // meters per builder unit
        const rotY = placement.rotationY || 0;
        const fp = placement.room.footprint;
        const go = placement.room.groundOffset;
        let rootScale = 1;
        let position: number[];
        if (fp && fp > 0 && Array.isArray(go)) {
          // Curator room sizing from the builder multiplies the tile fit.
          rootScale = (tileMeters / fp) * (placement.scale || 1);
          const ox = rootScale * go[0];
          const oy = rootScale * go[1];
          const oz = rootScale * go[2];
          const cos = Math.cos(rotY);
          const sin = Math.sin(rotY);
          position = [
            k * placement.position[0] + ox * cos + oz * sin,
            k * (placement.position[1] || 0) + oy,
            k * placement.position[2] - ox * sin + oz * cos,
          ];
        } else {
          // Old export without room measurements — native model scale.
          position = [
            k * placement.position[0],
            placement.position[1] || 0,
            k * placement.position[2],
          ];
        }
        const quaternion = yawToQuaternion(rotY);
        const scaleArr = [ rootScale, rootScale, rootScale ];

        // 1. Room model (content-addressed; re-uploads are no-ops)
        setStatus(placement.uid, "model");
        const glbRes = await fetch(placement.room.modelUrl);
        if (!glbRes.ok) throw new Error(`Room model unreachable (${glbRes.status})`);
        const glb = await glbRes.arrayBuffer();
        const modelUrl = await uploadAsset({
          baseUrl: url,
          bytes: glb,
          ext: "glb",
          mime: "model/gltf-binary",
        });

        // 2. Curated images become world assets — the exhibition lives in
        //    the world itself, not as hotlinks to museum infrastructure.
        //    Videos stay remote (they can be huge and stream fine). Failures
        //    fall back to the original URL so one dead image never blocks a
        //    room.
        setStatus(placement.uid, "artworks");
        const artworks = [];
        for (const art of placement.artworks) {
          let imageUrl = art.imageUrl;
          if (imageUrl && !imageUrl.startsWith("asset://")) {
            try {
              const res = await fetch(imageUrl);
              if (res.ok) {
                const mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
                const ext
                  = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif" }[mime]
                    || "jpg";
                imageUrl = await uploadAsset({
                  baseUrl: url,
                  bytes: await res.arrayBuffer(),
                  ext,
                  mime,
                });
              }
            } catch {
              /* keep the remote URL */
            }
          }
          artworks.push({ ...art, imageUrl });
        }

        // 3. Per-room curation script (baked slot anchors make un_MUSEUM
        //    Auto_NNN slots work — they never exist as GLB nodes).
        setStatus(placement.uid, "script");
        const script = new TextEncoder().encode(
          generateRoomScript({
            artworks,
            slots: placement.slots || [],
            artSize,
            rootScale,
          }),
        );
        const scriptUrl = await uploadAsset({
          baseUrl: url,
          bytes: script,
          ext: "js",
          mime: "text/javascript",
        });

        setStatus(placement.uid, "spawning");
        const meta = {
          name: `MOCA · ${placement.room.title}`,
          author: "Museum of Crypto Art",
          url: "https://museumofcryptoart.com/rooms/world",
          desc: `${placement.artworks.length} works · "${exhibition.name}" · curated with the MOCA world builder`,
        };

        // 4. Blueprint: create, or version-bump in place (entities rebuild
        //    live; props admins tuned in-world ride along untouched).
        const existing = session.blueprints.get(bpId);
        let status: RoomSpawnStatus;
        if (!existing) {
          session.send("blueprintAdded", {
            id: bpId,
            version: 0,
            ...meta,
            image: null,
            model: modelUrl,
            script: scriptUrl,
            props: {},
            preload: false,
            public: false,
            locked: false,
            frozen: false,
            unique: false,
            scene: false,
            disabled: false,
          });
          status = "created";
          result.created++;
        } else if (existing.model !== modelUrl || existing.script !== scriptUrl) {
          session.send("blueprintModified", {
            id: bpId,
            version: (existing.version ?? 0) + 1,
            ...meta,
            model: modelUrl,
            script: scriptUrl,
          });
          status = "updated";
          result.updated++;
        } else {
          status = "unchanged";
          result.unchanged++;
        }

        // 5. Entity: only created when missing, so room positions refined
        //    in-engine survive re-spawns. `relayout` snaps them back.
        //    Entities from spawner versions that predate tile normalization
        //    (scale 1 where the layout now calls for another) are healed.
        const existingEntity = session.entities.get(enId);
        if (!existingEntity) {
          session.send("entityAdded", {
            id: enId,
            type: "app",
            blueprint: bpId,
            position,
            quaternion,
            scale: scaleArr,
            mover: null,
            uploader: null,
            pinned,
            state: {},
          });
        } else {
          const eScale = (existingEntity.scale as number[] | undefined) || [ 1, 1, 1 ];
          const legacyUnscaled
            = Math.abs(eScale[0] - 1) < 1e-6 && Math.abs(rootScale - 1) > 1e-3;
          if (relayout || legacyUnscaled) {
            session.send("entityModified", { id: enId, position, quaternion, scale: scaleArr, pinned });
          } else if (!!(existingEntity as { pinned?: boolean }).pinned !== pinned) {
            // Pin state follows this spawn's intent — heal rooms spawned back
            // when pinning was the default, so they're grabbable right away.
            session.send("entityModified", { id: enId, pinned });
          }
        }

        result.artworks += placement.artworks.length;
        expected.push({ bpId, enId, uid: placement.uid });
        setStatus(placement.uid, status);
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (err) {
        result.failed++;
        setStatus(placement.uid, "failed", err instanceof Error ? err.message : String(err));
      }
    }

    // ---- spawn point ----------------------------------------------------
    // The curator's chosen entry point: move our own (invisible) player
    // there and tell the engine `/spawn set` — visitors then enter the
    // exhibition exactly where the builder intended.
    if (exhibition.spawn && Array.isArray(exhibition.spawn.position) && session.selfId) {
      try {
        const k = tileMeters / BUILDER_TILE;
        const sp = exhibition.spawn;
        const pos = [ k * sp.position[0], k * (sp.position[1] || 0) + 0.2, k * sp.position[2] ];
        session.send("entityModified", {
          id: session.selfId,
          position: pos,
          quaternion: yawToQuaternion(sp.rotationY || 0),
        });
        await new Promise(resolve => setTimeout(resolve, 400));
        session.send("command", { args: [ "spawn", "set" ] });
      } catch {
        /* spawn point is a nicety — never fail the spawn over it */
      }
    }

    // ---- the museum guide (agentic VRM avatar) -------------------------
    // Twin of the CLI's --guide path: register the exhibition context with
    // the MOCA API (what the guide answers from), upload the .vrm, generate
    // the guide app script, and spawn it idempotently like a room.
    if (guide) {
      try {
        const pushed = await pushGuide(session, exhibition, guide, {
          url,
          tileMeters,
          pinned,
          onStatus: status => setStatus(GUIDE_UID, status),
        });
        if (pushed.status === "created") result.created++;
        else if (pushed.status === "updated") result.updated++;
        else result.unchanged++;
        expected.push({ bpId: pushed.bpId, enId: pushed.enId, uid: GUIDE_UID });
        setStatus(GUIDE_UID, pushed.status);
      } catch (err) {
        result.failed++;
        setStatus(GUIDE_UID, "failed", err instanceof Error ? err.message : String(err));
      }
    }

    // Let the last packets land before disconnecting.
    await new Promise(resolve => setTimeout(resolve, 1000));
    session.close();

    // Verification pass: a fresh anonymous session sees the world's live
    // state — if our ids are there, the spawn truly landed (this is also
    // what catches a wrong admin key, since the engine drops unauthorized
    // packets silently).
    report("verify");
    if (expected.length) {
      const check = await HyperfySession.connect({ url, name: "MOCA Verify" });
      for (const e of expected) {
        if (!(check.blueprints.has(e.bpId) && check.entities.has(e.enId))) {
          setStatus(e.uid, "failed", "Did not appear in the world — wrong admin key?");
          result.failed++;
        }
      }
      check.close();
      result.verified = rooms.every(r => r.status !== "failed");
    }

    report("done");
    return result;
  } finally {
    session.close();
  }
}

/**
 * Push the guide app into a connected world session — registration, .vrm,
 * generated script, deterministic blueprint/entity. Used by spawnExhibition
 * (alongside the rooms) and spawnGuide (guide only, e.g. swapping persona
 * after the rooms are already in the world).
 */
async function pushGuide(
  session: HyperfySession,
  exhibition: HyperfyExhibition,
  guide: GuideOptions,
  opts: {
    url: string;
    tileMeters: number;
    pinned: boolean;
    onStatus?: (status: RoomSpawnStatus) => void;
  },
): Promise<{ bpId: string; enId: string; status: RoomSpawnStatus }> {
  const { url, tileMeters, pinned, onStatus } = opts;
  const apiUrl = (guide.apiUrl || DEFAULT_GUIDE_API).replace(/\/+$/, "");
  const guideName = guide.name || "Tsahafi";
  const decc0Id = guide.decc0Id || 4209;
  const exhibitionKey = exhibition.id || exhibition.name || "default";

  // 1. Register the context — enrichment (architects, artists, work
  //    descriptions) happens server-side from the museum's own data.
  //    Failure is not fatal: the guide spawns on baked knowledge.
  onStatus?.("script");
  const registration = await registerGuideExhibition(exhibition, apiUrl);
  const { suggestions, counts } = registration;

  // 2. The guide's body — a .vrm blueprint model renders as an avatar.
  onStatus?.("model");
  const vrmRes = await fetch(guide.avatarUrl);
  if (!vrmRes.ok) throw new Error(`Guide avatar unreachable (${vrmRes.status})`);
  const avatarUrl = await uploadAsset({
    baseUrl: url,
    bytes: await vrmRes.arrayBuffer(),
    ext: "vrm",
    mime: "model/gltf-binary",
  });

  // 3. The guide's mind — the generated app script.
  onStatus?.("script");
  const guideScript = new TextEncoder().encode(
    generateGuideScript({
      exhibitionId: registration.id,
      exhibitionName: exhibition.name,
      apiUrl,
      guideName,
      decc0Id,
      customSoul: guide.customSoul,
      soulName: guide.soulName,
      soulRef: guide.soulRef,
      suggestions,
      roomCount: counts.rooms,
      artworkCount: counts.artworks,
    }),
  );
  const guideScriptUrl = await uploadAsset({
    baseUrl: url,
    bytes: guideScript,
    ext: "js",
    mime: "text/javascript",
  });

  // 4. Stand the guide at the heart of the exhibition, facing center.
  onStatus?.("spawning");
  const k = tileMeters / BUILDER_TILE;
  let cx = 0;
  let cz = 0;
  for (const p of exhibition.placements) {
    cx += k * p.position[0];
    cz += k * p.position[2];
  }
  cx /= exhibition.placements.length || 1;
  cz /= exhibition.placements.length || 1;
  const gPosition = [ cx, 0, cz + tileMeters * 0.55 ];
  const gQuaternion = yawToQuaternion(0); // VRM forward is -Z: yaw 0 faces the exhibition center

  const bpId = await deterministicUuid(`${exhibitionKey}:guide:blueprint`);
  const enId = await deterministicUuid(`${exhibitionKey}:guide:entity`);
  const meta = {
    name: "MOCA · Museum Guide",
    author: "Museum of Crypto Art",
    url: "https://museumofcryptoart.com/rooms/world",
    desc: `${guideName} — the AI guide of "${exhibition.name}". Hold E to talk.`,
  };
  const props = {
    guideName,
    decc0: decc0Id,
    customSoul: guide.customSoul || "",
    apiUrl,
    exhibitionId: registration.id,
    exhibitionName: exhibition.name,
  };

  const existing = session.blueprints.get(bpId);
  let status: RoomSpawnStatus;
  if (!existing) {
    session.send("blueprintAdded", {
      id: bpId,
      version: 0,
      ...meta,
      image: null,
      model: avatarUrl,
      script: guideScriptUrl,
      props,
      preload: false,
      public: false,
      locked: false,
      frozen: false,
      unique: false,
      scene: false,
      disabled: false,
    });
    status = "created";
  } else if (existing.model !== avatarUrl || existing.script !== guideScriptUrl) {
    session.send("blueprintModified", {
      id: bpId,
      version: (existing.version ?? 0) + 1,
      ...meta,
      model: avatarUrl,
      script: guideScriptUrl,
      props: { ...(existing.props as object), ...props },
    });
    status = "updated";
  } else {
    status = "unchanged";
  }

  const existingGuide = session.entities.get(enId);
  if (!existingGuide) {
    session.send("entityAdded", {
      id: enId,
      type: "app",
      blueprint: bpId,
      position: gPosition,
      quaternion: gQuaternion,
      scale: [ 1, 1, 1 ],
      mover: null,
      uploader: null,
      pinned,
      state: {},
    });
  } else if (!!(existingGuide as { pinned?: boolean }).pinned !== pinned) {
    session.send("entityModified", { id: enId, pinned });
  }
  return { bpId, enId, status };
}

export interface GuideSpawnResult {
  status: RoomSpawnStatus;
  verified: boolean;
}

/**
 * Send ONLY the guide into a world — for (re)launching the agent into an
 * exhibition whose rooms are already spawned: pick a persona, click, and the
 * same deterministic ids update the existing guide in place (or stand a new
 * one at the exhibition center).
 */
export async function spawnGuide(
  exhibition: HyperfyExhibition,
  {
    url,
    key,
    tileMeters = 16,
    pinned = false,
    guide,
    onStatus,
  }: {
    url: string;
    key?: string;
    tileMeters?: number;
    pinned?: boolean;
    guide: GuideOptions;
    onStatus?: (status: RoomSpawnStatus) => void;
  },
): Promise<GuideSpawnResult> {
  const session = await HyperfySession.connect({ url });
  try {
    if (session.hasAdminCode) {
      if (!key) {
        throw new Error("This world requires an admin key. Ask the world's operator for its ADMIN_CODE.");
      }
      await session.grantAdmin(key);
    }
    const pushed = await pushGuide(session, exhibition, guide, { url, tileMeters, pinned, onStatus });
    await new Promise(resolve => setTimeout(resolve, 1000));
    session.close();

    // Verification pass — same as room spawns: a fresh anonymous session
    // must see the guide, otherwise the admin key was wrong.
    const check = await HyperfySession.connect({ url, name: "MOCA Verify" });
    const verified = check.blueprints.has(pushed.bpId) && check.entities.has(pushed.enId);
    check.close();
    return { status: pushed.status, verified };
  } finally {
    session.close();
  }
}
