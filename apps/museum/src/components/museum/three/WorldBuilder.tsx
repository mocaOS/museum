"use client";

import { Suspense, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Grid, Html, Lightformer, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";
import ArtworkPlane, { DEFAULT_OVERRIDE } from "./ArtworkPlane";
import BuilderSidebar, {
  type PlacedSummary,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH,
  type SidebarTab,
} from "./BuilderSidebar";
import ControlsHelp from "./ControlsHelp";
import GuideDialog from "./GuideDialog";
import SpawnHyperfyDialog from "./SpawnHyperfyDialog";
import { generateAutoSlots } from "./auto-slots";
import {
  type RoomNorm,
  buildHyperfyExhibition,
  downloadHyperfyExhibition,
} from "./hyperfy-export";
import { resolveSlotFacing } from "./slot-facing";
import {
  type RoomSlot,
  type RoomSlotData,
  bakedToRoomSlots,
  extractSlots,
  setPlaceholdersVisible,
} from "./slots";
import {
  type Assignments,
  type SlotOverride,
  type SlotOverrides,
  type WorldLayout,
  currentExhibitName,
  loadWorldLayout,
  newExhibitionId,
  saveWorldLayout,
  syncCurrentExhibit,
} from "./world-storage";
import type { NftView } from "@/lib/museum/media";

export interface WorldRoom {
  id: number;
  title: string;
  architect?: string | null;
  modelUrl?: string;
  imageUrl?: string;
  /**
   * Onchain slot amount (Directus `rooms.slots`, synced from the smart
   * contract — the source of truth). Used to generate default slots for
   * models that carry no authored `Slot_NNN` placeholders (un_MUSEUMs).
   */
  slotCount?: number | null;
  /**
   * Baked slot anchors with resolved facing (Directus `rooms.slot_data`,
   * written by apps/migration/bake-slot-data.ts). When present — and computed
   * from the same GLB this room loads — it replaces runtime extraction,
   * generation, and facing probes entirely.
   */
  slotData?: RoomSlotData | null;
}

interface Placed {
  uid: string;
  room: WorldRoom;
  position: [number, number, number];
  rotationY: number;
  /** Curator size multiplier on the tile-normalized room (1 = one tile). */
  scale?: number;
}

// A room's native scaling factor: the base size it spawns at in Hyperfy
// (entity scale = tile-fit × this). New rooms default to 2× so they're roomy to
// walk; curators pre-configure it here and can still resize each room in-world
// (grab + Shift+scroll). Range is wide enough to make big rooms without hitting
// the ceiling at the default.
const ROOM_SCALE_MIN = 0.4;
const ROOM_SCALE_MAX = 6;
const ROOM_SCALE_STEP = 0.1;
const DEFAULT_ROOM_SCALE = 2;

const TILE = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (v: number) => Math.round(v / 2) * 2;

const SCALE_STEP = 0.15;
const MIN_ART_SCALE = 0.35;
const MAX_ART_SCALE = 3;

// Stable empty maps for rooms with nothing assigned — fresh `{}` fallbacks
// would defeat PlacedRoom's memoization on every render.
const EMPTY_ASSIGNMENTS: Assignments = {};
const EMPTY_OVERRIDES: SlotOverrides = {};

/**
 * Camera director API — scenario verbs instead of raw poses. Every verb
 * resolves its framing from live scene datapoints (per-room world bounds,
 * exhibition extents, slot transforms, the camera's own FOV) rather than
 * hard-coded distances, so framing stays correct across room scales,
 * sculptural un_MUSEUM heights, and viewport aspect ratios.
 */
export interface CameraApi {
  /** Frame one placed room: FOV-fit to its measured bounds, aimed part-way
   *  up tall pieces, approaching from the camera's current yaw. */
  frameRoom: (uid: string) => void;
  /** Overview the whole exhibition (bounding circle over every room);
   *  falls back to the home pose on an empty world. */
  frameExhibition: () => void;
  /** Fly to stand in front of a wall slot, looking straight at it. */
  focusSlot: (pos: THREE.Vector3, normal: THREE.Vector3, size: number) => void;
  /** Multiply the goal camera distance (for the on-screen zoom buttons). */
  zoomBy: (factor: number) => void;
  /** The rig's current goal — lets callers reason "from this angle". */
  getGoal: () => { target: THREE.Vector3; yaw: number; pitch: number; dist: number };
  /** Overview from above — survey a room and its surroundings. */
  birdsEye: (uid: string) => void;
  /** Nudge the goal yaw — the damped rig turns this into a smooth orbit. */
  orbitBy: (rad: number) => void;
}

/** A placed room resolved into world space — the camera director's datapoints. */
export interface RoomWorldBounds {
  center: [number, number, number];
  /** Half-diagonal of the room's footprint at its placement scale. */
  radius: number;
  height: number;
}

/** A slot resolved into world space, for the sidebar navigator + filling. */
export interface SlotWorld {
  id: string;
  index: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
}

// --- BVH-accelerated raycasting ----------------------------------------------
// r3f hit-tests every mesh that has pointer handlers up its tree on EVERY
// pointer move. A placed room is a full GLB — without an acceleration
// structure that's a linear walk over millions of triangles per mousemove,
// which is exactly the "1000 fps until a room is placed, then the UI dies"
// failure mode. Bounds trees turn those casts into log-time.
type BvhGeometry = THREE.BufferGeometry & {
  boundsTree?: unknown;
  computeBoundsTree?: typeof computeBoundsTree;
  disposeBoundsTree?: typeof disposeBoundsTree;
};

// Clones of the same GLB share geometry (so does the useGLTF cache) — refcount
// per geometry so duplicate placements reuse one bounds tree and it only
// disposes when the last placement unmounts.
const bvhRefCounts = new Map<THREE.BufferGeometry, number>();

function useRoomBvh(root: THREE.Object3D) {
  useEffect(() => {
    const geoms: BvhGeometry[] = [];
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry as BvhGeometry;
      mesh.raycast = acceleratedRaycast;
      const count = bvhRefCounts.get(g) ?? 0;
      if (count === 0 && !g.boundsTree) {
        g.computeBoundsTree = computeBoundsTree;
        g.disposeBoundsTree = disposeBoundsTree;
        g.computeBoundsTree();
      }
      bvhRefCounts.set(g, count + 1);
      geoms.push(g);
    });
    return () => {
      for (const g of geoms) {
        const count = (bvhRefCounts.get(g) ?? 1) - 1;
        if (count <= 0) {
          bvhRefCounts.delete(g);
          g.disposeBoundsTree?.();
        } else {
          bvhRefCounts.set(g, count);
        }
      }
    };
  }, [ root ]);
}

// --- Custom RTS / city-builder camera ---------------------------------------
// Goal-damped spring-arm rig: every input (keys, wheel, drags, fly-to) writes a
// *goal* target/yaw/pitch/distance; the frame loop exponentially damps the live
// rig toward it. Direct control stays tight while zoom and fly-to glide —
// standard RTS camera feel. Wheel zooms toward the cursor's ground point.
//
// The director verbs (frameRoom / frameExhibition / birdsEye / focusSlot) read
// their datapoints from boundsRef (per-room measured world bounds) and
// placedRef (the live placement list), fit distances from the camera's actual
// FOV, and arc long fly-tos up over the world via a decaying "lift" that any
// manual input cancels instantly.
function RTSControls({
  apiRef,
  boundsRef,
  placedRef,
}: {
  apiRef: React.MutableRefObject<CameraApi | null>;
  boundsRef: React.MutableRefObject<Record<string, RoomWorldBounds>>;
  placedRef: React.MutableRefObject<Placed[]>;
}) {
  const { camera, gl, scene, raycaster } = useThree();
  const ray = useRef(new THREE.Raycaster());
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const s = useRef({
    cur: { target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 4, pitch: THREE.MathUtils.degToRad(20), dist: 46 },
    goal: { target: new THREE.Vector3(0, 0, 0), yaw: Math.PI / 4, pitch: THREE.MathUtils.degToRad(20), dist: 46 },
    keys: new Set<string>(),
    drag: null as null | "rotate" | "pan",
    last: { x: 0, y: 0 },
    edge: { x: 0, y: 0 },
    /** Transit-arc altitude: extra distance during long fly-tos, decays to 0. */
    lift: 0,
  });
  // Reusable frame-loop scratch — the rig must not feed the GC every frame.
  const tmp = useRef({ f: new THREE.Vector3(), rt: new THREE.Vector3(), mv: new THREE.Vector3(), off: new THREE.Vector3() });

  // The shared pointer-event raycaster honors three-mesh-bvh's firstHitOnly
  // flag: with bounds trees on the room meshes, hover hit-tests return the
  // nearest hit per mesh instead of collecting every intersection.
  useEffect(() => {
    const rc = raycaster as THREE.Raycaster & { firstHitOnly?: boolean };
    rc.firstHitOnly = true;
    return () => {
      delete rc.firstHitOnly;
    };
  }, [ raycaster ]);

  useEffect(() => {
    // Distance at which a sphere of `radius` exactly fills the tighter FOV axis.
    const fitDist = (radius: number) => {
      const cam = camera as THREE.PerspectiveCamera;
      const vFov = THREE.MathUtils.degToRad(cam.fov || 42);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * (cam.aspect || 1));
      return radius / Math.sin(Math.min(vFov, hFov) / 2);
    };

    // Measured bounds when the model has loaded; tile-footprint estimate
    // before that (fresh placements / freshly loaded exhibits are framable
    // immediately, the framing just refines once measured).
    const boundsOf = (uid: string): RoomWorldBounds | null => {
      const b = boundsRef.current[uid];
      if (b) return b;
      const p = placedRef.current.find(x => x.uid === uid);
      if (!p) return null;
      const r = TILE * 0.71 * (p.scale || 1);
      return {
        center: [ p.position[0], r * 0.5, p.position[2] ],
        radius: r,
        height: TILE * 0.6 * (p.scale || 1),
      };
    };

    // Long fly-tos pull up and over the world instead of dragging the camera
    // through rooms at floor level. Proportional to travel, decays in-flight.
    const startFlight = () => {
      const c = s.current;
      const travel = c.cur.target.distanceTo(c.goal.target);
      c.lift = travel > Math.max(c.cur.dist, 14) ? Math.min(travel * 0.35, 44) : 0;
    };

    apiRef.current = {
      frameRoom: (uid) => {
        const b = boundsOf(uid);
        if (!b) return;
        const g = s.current.goal;
        // Aim part-way up the piece: tall sculptural un_MUSEUMs read as a
        // whole instead of the camera staring at their feet.
        g.target.set(b.center[0], clamp(b.height * 0.3, 0, 6), b.center[2]);
        g.pitch = THREE.MathUtils.degToRad(26);
        g.dist = clamp(fitDist(b.radius * 1.18), 9, 90);
        startFlight();
      },
      frameExhibition: () => {
        const items = placedRef.current;
        const g = s.current.goal;
        if (!items.length) {
          g.target.set(0, 0, 0);
          g.yaw = Math.PI / 4;
          g.pitch = THREE.MathUtils.degToRad(20);
          g.dist = 46;
          s.current.lift = 0;
          return;
        }
        // Bounding circle over every room's measured (or estimated) footprint.
        const bs = items
          .map(p => boundsOf(p.uid))
          .filter((b): b is RoomWorldBounds => !!b);
        const center = new THREE.Vector3();
        for (const b of bs) center.add(new THREE.Vector3(b.center[0], 0, b.center[2]));
        center.divideScalar(bs.length || 1);
        let r = TILE;
        for (const b of bs) {
          r = Math.max(r, center.distanceTo(new THREE.Vector3(b.center[0], 0, b.center[2])) + b.radius);
        }
        g.target.copy(center);
        g.pitch = THREE.MathUtils.degToRad(40);
        g.dist = clamp(fitDist(r * 1.1) + 4, 18, 140);
        startFlight();
      },
      focusSlot: (pos, normal, size) => {
        // Aim the rig at the artwork itself (not the ground) and stand a short
        // distance out along the wall normal, roughly eye-level and head-on.
        const n = normal.clone().setY(0);
        if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
        n.normalize();
        const g = s.current.goal;
        g.target.copy(pos);
        const pitch = THREE.MathUtils.degToRad(10);

        // Stand-off fit from the camera's FOV so the work fills roughly half
        // the viewport height regardless of slot or screen size — close
        // enough to read a work, far enough to understand the wall around
        // it, and never beyond the room, where walls would swallow the rig.
        const vFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 42);
        const desired = clamp((size * 0.5) / Math.tan(vFov / 2) / 0.5, 4.5, 13);

        // Clearance probe: cast from the artwork outward along the exact
        // camera direction; the first wall/pillar/artwork limits how far the
        // camera may stand on that side.
        const clearanceAlong = (side: THREE.Vector3) => {
          const yaw = Math.atan2(side.x, side.z);
          const dir = new THREE.Vector3(
            Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            Math.cos(yaw) * Math.cos(pitch),
          ).normalize();
          const start = pos.clone().addScaledVector(dir, 0.25);
          ray.current.set(start, dir);
          ray.current.far = desired;
          const hits = ray.current
            .intersectObjects(scene.children, true)
            .filter((h) => {
              const o = h.object as THREE.Mesh;
              // Ignore non-visible helpers, the ground plane, and unlit overlays
              // (slot markers / artwork planes use MeshBasicMaterial) — plus
              // anything hugging the slot itself (its own frame mesh).
              if (h.distance < 0.5) return false;
              if (!o.visible) return false;
              const mat = o.material as THREE.Material & { transparent?: boolean };
              if (mat && (mat as THREE.Material).type === "MeshBasicMaterial") return false;
              return true;
            });
          return { yaw, clearance: hits.length ? hits[0].distance + 0.25 : desired };
        };

        // The builder's slot normal is authoritative (authored slots carry the
        // inward flip; auto slots face their surface). Flipping the camera to
        // the other side is a LAST RESORT for the rare GLB whose normal points
        // into its wall: only when the normal side is essentially inside
        // geometry AND the far side is clearly open. (A looser rule flips on
        // mere columns/corridors and ends up staring at artwork backsides.)
        let pick = clearanceAlong(n);
        if (pick.clearance < 1.1) {
          const flipped = clearanceAlong(n.clone().negate());
          if (flipped.clearance > 3) pick = flipped;
        }

        const MARGIN = 0.4;
        g.yaw = pick.yaw;
        g.pitch = pitch;
        g.dist = Math.min(desired, Math.max(2.5, pick.clearance - MARGIN));
        startFlight();
      },
      zoomBy: (factor) => {
        const g = s.current.goal;
        g.dist = clamp(g.dist * factor, 3, 140);
        s.current.lift = 0;
      },
      getGoal: () => {
        const g = s.current.goal;
        return { target: g.target.clone(), yaw: g.yaw, pitch: g.pitch, dist: g.dist };
      },
      birdsEye: (uid) => {
        const b = boundsOf(uid);
        if (!b) return;
        const g = s.current.goal;
        g.target.set(b.center[0], 0, b.center[2]);
        g.pitch = THREE.MathUtils.degToRad(58);
        g.dist = clamp(fitDist(b.radius * 1.45), 16, 70);
        startFlight();
      },
      orbitBy: (rad) => {
        s.current.goal.yaw += rad;
      },
    };
  }, [ apiRef, scene, camera, boundsRef, placedRef ]);

  useEffect(() => {
    const dom = gl.domElement;
    // Ignore keystrokes while the user is typing in a form field (search box,
    // etc.) so WASD/Q/E don't leak into camera movement.
    const typingInField = () => {
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable === true;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typingInField()) return;
      s.current.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => s.current.keys.delete(e.code);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      s.current.lift = 0; // manual input takes over from any transit arc
      const g = s.current.goal;
      // Proportional to actual wheel delta (smooth on trackpads, ~8% per
      // notch on a clicky wheel) instead of a fixed 14% per event. Min
      // distance matches what the slot fly-to is allowed to reach, so manual
      // zoom can get just as close to an artwork.
      const lines = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(clamp(lines, -240, 240) * 0.0008);
      const next = clamp(g.dist * factor, 3, 140);
      // Zoom toward (or away from) the ground point under the cursor — the
      // classic map-zoom feel — instead of zooming blindly at screen center.
      const rect = dom.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      );
      ray.current.setFromCamera(ndc, camera);
      ray.current.far = Number.POSITIVE_INFINITY;
      const hit = new THREE.Vector3();
      if (ray.current.ray.intersectPlane(groundPlane.current, hit)) {
        const k = clamp(1 - next / g.dist, -0.6, 0.9);
        g.target.lerp(new THREE.Vector3(hit.x, 0, hit.z), k);
      }
      g.dist = next;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) s.current.drag = "rotate";
      else if (e.button === 1) s.current.drag = "pan";
      if (s.current.drag) {
        s.current.last = { x: e.clientX, y: e.clientY };
        // Capture the pointer: the drag keeps working (and the context menu
        // keeps suppressed) even when the cursor crosses the sidebar or
        // leaves the window — no stuck drags, no camera whiplash.
        try {
          dom.setPointerCapture(e.pointerId);
        } catch {
          /* capture is an enhancement */
        }
      }
    };
    const onUp = (e: PointerEvent) => {
      s.current.drag = null;
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* not captured */
      }
    };
    const onMove = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const ex = e.clientX - r.left;
      const ey = e.clientY - r.top;
      const m = 36;
      // Edge-pan pauses while orbiting/panning by drag — the two stacked
      // make the camera feel possessed near the viewport edges.
      s.current.edge.x = !s.current.drag && ex >= 0 && ex <= r.width ? (ex < m ? -1 : ex > r.width - m ? 1 : 0) : 0;
      s.current.edge.y = !s.current.drag && ey >= 0 && ey <= r.height ? (ey < m ? -1 : ey > r.height - m ? 1 : 0) : 0;
      if (s.current.drag) {
        s.current.lift = 0; // manual input takes over from any transit arc
        const dx = e.clientX - s.current.last.x;
        const dy = e.clientY - s.current.last.y;
        s.current.last = { x: e.clientX, y: e.clientY };
        const g = s.current.goal;
        if (s.current.drag === "rotate") {
          g.yaw -= dx * 0.005;
          g.pitch = clamp(g.pitch + dy * 0.005, 0.12, 1.45);
        } else {
          const k = s.current.cur.dist * 0.0016;
          const yaw = s.current.cur.yaw;
          const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          g.target.addScaledVector(rt, -dx * k).addScaledVector(f, dy * k);
        }
      }
    };
    const onLeave = () => (s.current.edge = { x: 0, y: 0 });
    const onCancel = () => (s.current.drag = null);
    const onCtx = (e: Event) => e.preventDefault();
    // A right-drag that ends over the sidebar (or anywhere else) must not
    // pop the browser menu either — suppress it window-wide while dragging.
    const onCtxWindow = (e: Event) => {
      if (s.current.drag) e.preventDefault();
    };

    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("pointercancel", onCancel);
    dom.addEventListener("contextmenu", onCtx);
    window.addEventListener("contextmenu", onCtxWindow);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerleave", onLeave);
      dom.removeEventListener("pointercancel", onCancel);
      dom.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("contextmenu", onCtxWindow);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [ gl, camera ]);

  useFrame((_, dt) => {
    const { cur, goal: g } = s.current;
    const c = s.current;
    const { f, rt, mv, off } = tmp.current;
    const yaw = cur.yaw;
    f.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    rt.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const speed = cur.dist * 1.1 * dt * (c.keys.has("ShiftLeft") || c.keys.has("ShiftRight") ? 2.2 : 1);
    mv.set(0, 0, 0);
    if (c.keys.has("KeyW") || c.keys.has("ArrowUp")) mv.add(f);
    if (c.keys.has("KeyS") || c.keys.has("ArrowDown")) mv.sub(f);
    if (c.keys.has("KeyD") || c.keys.has("ArrowRight")) mv.add(rt);
    if (c.keys.has("KeyA") || c.keys.has("ArrowLeft")) mv.sub(rt);
    mv.addScaledVector(rt, c.edge.x).addScaledVector(f, -c.edge.y);
    if (mv.lengthSq() > 0) {
      g.target.addScaledVector(mv.normalize(), speed);
      c.lift = 0; // keyboard flight takes over from any transit arc
    }
    if (c.keys.has("KeyQ")) g.yaw += dt * 1.3;
    if (c.keys.has("KeyE")) g.yaw -= dt * 1.3;
    // Vertical flight: T/G (or PageUp/PageDown) raise and lower the focal
    // point — inspect tall walls and sculptural un_MUSEUMs at any height.
    if (c.keys.has("KeyT") || c.keys.has("PageUp")) {
      g.target.y = clamp(g.target.y + speed * 0.6, 0, 40);
      c.lift = 0;
    }
    if (c.keys.has("KeyG") || c.keys.has("PageDown")) {
      g.target.y = clamp(g.target.y - speed * 0.6, 0, 40);
      c.lift = 0;
    }

    // Transit arc decays on its own clock — the camera climbs at the start
    // of a long fly-to and settles back down as it nears the destination.
    c.lift = c.lift > 0.4 ? c.lift * Math.exp(-1.7 * dt) : 0;

    // Exponential damping toward the goal (frame-rate independent). Yaw takes
    // the short way around the circle so fly-to never spins the long way.
    const lam = 1 - Math.exp(-9 * dt);
    cur.target.lerp(g.target, lam);
    cur.dist += (g.dist + c.lift - cur.dist) * lam;
    cur.pitch += (g.pitch - cur.pitch) * lam;
    const dyaw = Math.atan2(Math.sin(g.yaw - cur.yaw), Math.cos(g.yaw - cur.yaw));
    cur.yaw += dyaw * lam;

    off.set(
      Math.sin(cur.yaw) * Math.cos(cur.pitch),
      Math.sin(cur.pitch),
      Math.cos(cur.yaw) * Math.cos(cur.pitch),
    ).multiplyScalar(cur.dist);
    camera.position.copy(cur.target).add(off);
    camera.lookAt(cur.target);
  });

  return null;
}

function SlotMarker({
  slot,
  orientation,
  inwardOffset,
  active,
  onClick,
}: {
  slot: RoomSlot;
  orientation: THREE.Quaternion;
  /** Local vector pushing the marker a little off the wall toward the room. */
  inwardOffset: THREE.Vector3;
  active: boolean;
  onClick: () => void;
}) {
  const { gl } = useThree();
  return (
    <group position={slot.position.clone().add(inwardOffset)} quaternion={orientation}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          gl.domElement.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          gl.domElement.style.cursor = "";
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onClick();
        }}
      >
        <planeGeometry args={[ slot.width, slot.height ]} />
        <meshBasicMaterial
          color={active ? "#e0b24d" : "#5fb0ff"}
          transparent
          opacity={active ? 0.5 : 0.26}
          side={THREE.DoubleSide}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>
      {/* Frame outline */}
      <lineSegments renderOrder={999}>
        <edgesGeometry args={[ new THREE.PlaneGeometry(slot.width, slot.height) ]} />
        <lineBasicMaterial color={active ? "#e0b24d" : "#5fb0ff"} transparent opacity={0.95} depthTest={false} />
      </lineSegments>
      {/* Facing arrow on the active slot — shows which side the work will face. */}
      {active && (() => {
        const len = Math.min(slot.width, slot.height) * 0.45;
        return (
          <group renderOrder={999}>
            <mesh position={[ 0, 0, len * 0.4 ]} rotation={[ Math.PI / 2, 0, 0 ]}>
              <cylinderGeometry args={[ len * 0.035, len * 0.035, len * 0.8, 8 ]} />
              <meshBasicMaterial color="#e0b24d" depthTest={false} />
            </mesh>
            <mesh position={[ 0, 0, len * 0.95 ]} rotation={[ Math.PI / 2, 0, 0 ]}>
              <coneGeometry args={[ len * 0.12, len * 0.3, 12 ]} />
              <meshBasicMaterial color="#e0b24d" depthTest={false} />
            </mesh>
          </group>
        );
      })()}
    </group>
  );
}

// Memoized: the builder re-renders on every selection / sidebar / curation
// state change, and the room subtrees (full GLBs + slot maps) are by far the
// heaviest children. All callbacks are uid-routed and referentially stable so
// unrelated state changes never touch a room's subtree.
const PlacedRoom = memo(({
  placed,
  selected,
  curating,
  assignments,
  overrides,
  activeSlotId,
  onSelect,
  onFocus,
  onStartDrag,
  onSlotClick,
  onArtSelect,
  onOverrideChange,
  onSlotsReady,
  onMeasure,
  onBounds,
}: {
  placed: Placed;
  selected: boolean;
  curating: boolean;
  assignments: Assignments;
  overrides: SlotOverrides;
  activeSlotId: string | null;
  onSelect: (uid: string) => void;
  onFocus: (uid: string) => void;
  onStartDrag: (uid: string) => void;
  onSlotClick: (slot: RoomSlot) => void;
  /** Select a hung artwork's slot without flying the camera (direct click). */
  onArtSelect: (slot: RoomSlot) => void;
  onOverrideChange: (uid: string, slotId: string, next: SlotOverride) => void;
  onSlotsReady: (uid: string, slots: SlotWorld[]) => void;
  /** Lift the GLB's raw measurements (Hyperfy exports reproduce the layout from them). */
  onMeasure: (uid: string, norm: RoomNorm) => void;
  /** Report world bounds (center/radius/height) — the camera director's datapoints. */
  onBounds: (uid: string, b: RoomWorldBounds) => void;
}) => {
  const { scene } = useGLTF(placed.room.modelUrl!, true, true);
  const { gl } = useThree();
  const cloned = useMemo(() => scene.clone(true), [ scene ]);
  // Bounds trees on the room geometry — pointer-move hit-tests and the
  // camera's clearance probes go from per-triangle walks to log-time.
  useRoomBvh(cloned);
  // Slot source of truth, in order: baked rooms.slot_data JSON from the API
  // (positions + resolved facing, computed offline from this exact GLB) →
  // authored Slot_NNN placeholders → deterministic surface-sampled slots
  // matching the onchain slot amount (un_MUSEUMs).
  const slots = useMemo(() => {
    const baked = placed.room.slotData;
    if (baked?.slots?.length) return bakedToRoomSlots(baked);
    const authored = extractSlots(cloned);
    if (authored.length) return authored;
    const n = placed.room.slotCount ?? 0;
    return n > 0 ? generateAutoSlots(cloned, n, placed.room.id) : [];
  }, [ cloned, placed.room.slotData, placed.room.slotCount, placed.room.id ]);

  // Hide the placeholder quads in the model — we draw our own markers/artworks.
  useEffect(() => {
    setPlaceholdersVisible(cloned, false);
  }, [ cloned ]);

  // Measure the model's NATIVE bounds exactly once, keyed on the model only.
  // (setFromObject reads world-space bounds; `cloned` is later mounted inside
  // the scaled group below, so re-measuring on every scale change would fold
  // the applied scale back into the footprint and oscillate — the model
  // "flipped"/jumped on alternating +/- steps. The native measurement is
  // scale-independent; we derive `scale` from it.)
  const { offset, footprint, size } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const sz = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(sz);
    box.getCenter(c);
    return {
      offset: new THREE.Vector3(-c.x, -box.min.y, -c.z),
      footprint: Math.max(sz.x, sz.z) || 1,
      size: sz,
    };
  }, [ cloned ]);

  // Tile-fit × the curator's native scale — a pure derivation, never re-measures.
  const scale = (TILE / footprint) * (placed.scale || 1);

  // World bounds for the camera director (the inner group centers the model
  // on the placement origin with its floor at y=0, so center XZ = position).
  useEffect(() => {
    onBounds(placed.uid, {
      center: [ placed.position[0], (size.y * scale) / 2, placed.position[2] ],
      radius: Math.hypot(size.x, size.z) * scale * 0.5,
      height: size.y * scale,
    });
  }, [ placed.uid, placed.position, size, scale, onBounds ]);

  // Per-slot orientation in room-local space (shared by marker + art). Baked
  // slot_data quaternions are already facing-resolved offline; otherwise the
  // clearance probe in slot-facing.ts decides which side of the wall each
  // slot faces (auto slots keep their sampled surface normal).
  const oriented = useMemo(() => {
    if (placed.room.slotData?.slots?.length) {
      return slots.map(s => ({ slot: s, quat: s.quaternion.clone() }));
    }
    const resolved = resolveSlotFacing(cloned, slots);
    return slots.map(s => ({
      slot: s,
      quat: resolved.get(s.id)?.quaternion ?? s.quaternion.clone(),
    }));
  }, [ slots, cloned, placed.room.slotData ]);

  // Lift the raw GLB measurements + the baked slot map: Hyperfy spawns
  // reproduce the tile normalization from footprint/groundOffset and anchor
  // artworks on these slot transforms (un_MUSEUM Auto_NNN slots exist only
  // here at runtime — never as nodes in the uploaded GLB).
  useEffect(() => {
    onMeasure(placed.uid, {
      footprint,
      groundOffset: [ offset.x, offset.y, offset.z ],
      slots: oriented.map(({ slot, quat }) => ({
        id: slot.id,
        position: [ slot.position.x, slot.position.y, slot.position.z ],
        quaternion: [ quat.x, quat.y, quat.z, quat.w ],
        width: slot.width,
        height: slot.height,
      })),
    });
  }, [ placed.uid, footprint, offset, oriented, onMeasure ]);

  // Resolve every slot into world space for the sidebar navigator + camera fly.
  // World = outer(placement) ∘ inner(scale/offset) ∘ slotLocal.
  const worldSlots = useMemo<SlotWorld[]>(() => {
    const outer = new THREE.Matrix4().compose(
      new THREE.Vector3(...placed.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placed.rotationY, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const inner = new THREE.Matrix4().compose(
      new THREE.Vector3(offset.x * scale, offset.y * scale, offset.z * scale),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale),
    );
    const world = outer.multiply(inner);
    const rot = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    world.decompose(pos, rot, scl);
    return oriented.map(({ slot, quat }) => {
      const wp = slot.position.clone().applyMatrix4(world);
      const wn = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).applyQuaternion(rot).normalize();
      return {
        id: slot.id,
        index: slot.index,
        position: wp,
        normal: wn,
        size: Math.max(slot.width, slot.height) * scale,
      };
    });
  }, [ oriented, placed.position, placed.rotationY, offset, scale ]);

  useEffect(() => {
    onSlotsReady(placed.uid, worldSlots);
  }, [ placed.uid, worldSlots, onSlotsReady ]);

  // Small inward push so markers/art sit just off the wall (no z-fighting).
  const EPS = 0.06 / scale;

  return (
    <group
      position={placed.position}
      rotation={[ 0, placed.rotationY, 0 ]}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onFocus(placed.uid);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        // Rooms drag in build mode; while curating the room body is inert.
        gl.domElement.style.cursor = curating ? "" : "grab";
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = "";
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // While curating, let clicks fall through to slot markers (which sit
        // in front of the wall); only the room body grabs select/drag.
        if (curating) {
          onSelect(placed.uid);
          return;
        }
        e.stopPropagation();
        onSelect(placed.uid);
        onStartDrag(placed.uid);
        gl.domElement.style.cursor = "grabbing";
      }}
      onPointerUp={() => {
        if (!curating) gl.domElement.style.cursor = "grab";
      }}
    >
      {selected && (
        <mesh rotation={[ -Math.PI / 2, 0, 0 ]} position={[ 0, 0.02, 0 ]}>
          <ringGeometry args={[ TILE * 0.6, TILE * 0.72, 56 ]} />
          <meshBasicMaterial color="#e0b24d" transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Room geometry + its slots/artworks share the same scaled local space. */}
      <group scale={scale} position={[ offset.x * scale, offset.y * scale, offset.z * scale ]}>
        <primitive object={cloned} />

        {/* Hung artworks (always visible once assigned). */}
        {oriented.map(({ slot, quat }) => {
          const art = assignments[slot.id];
          if (!art) return null;
          const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).multiplyScalar(EPS);
          return (
            <ArtworkPlane
              key={slot.id}
              slot={slot}
              position={slot.position.clone().add(facing)}
              quaternion={quat}
              art={art}
              override={overrides[slot.id]}
              editable={curating}
              selected={curating && activeSlotId === slot.id}
              onSelect={curating ? () => onArtSelect(slot) : undefined}
              onOverrideChange={
                curating ? next => onOverrideChange(placed.uid, slot.id, next) : undefined
              }
            />
          );
        })}

        {/* Empty-slot markers (only while curating this room). */}
        {curating
          && oriented
            .filter(({ slot }) => !assignments[slot.id])
            .map(({ slot, quat }) => {
              const inward = new THREE.Vector3(0, 0, 1).applyQuaternion(quat).multiplyScalar(EPS);
              return (
                <SlotMarker
                  key={slot.id}
                  slot={slot}
                  orientation={quat}
                  inwardOffset={inward}
                  active={activeSlotId === slot.id}
                  onClick={() => onSlotClick(slot)}
                />
              );
            })}
      </group>
    </group>
  );
});

// The placement ghost is driven imperatively (position/rotation set straight
// on the group from pointer events) — routing every mousemove through React
// state re-rendered the whole builder tree and froze the UI while placing.
function Ghost({
  ref,
  initialPos,
  initialRotY,
}: {
  ref: React.Ref<THREE.Group>;
  initialPos: [number, number, number];
  initialRotY: number;
}) {
  // The marker previews the footprint a dropped room actually occupies, so it
  // tracks the default native scale (rooms drop at DEFAULT_ROOM_SCALE tiles).
  const fp = TILE * DEFAULT_ROOM_SCALE;
  return (
    <group ref={ref} position={initialPos} rotation={[ 0, initialRotY, 0 ]}>
      <mesh rotation={[ -Math.PI / 2, 0, 0 ]} position={[ 0, 0.03, 0 ]}>
        <planeGeometry args={[ fp, fp ]} />
        <meshBasicMaterial color="#e0b24d" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[ -Math.PI / 2, 0, 0 ]} position={[ 0, 0.04, 0 ]}>
        <ringGeometry args={[ fp * 0.7, fp * 0.72, 4 ]} />
        <meshBasicMaterial color="#e0b24d" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* facing arrow */}
      <mesh position={[ 0, 0.05, -fp * 0.4 ]} rotation={[ -Math.PI / 2, 0, 0 ]}>
        <circleGeometry args={[ 0.5, 3 ]} />
        <meshBasicMaterial color="#e0b24d" />
      </mesh>
    </group>
  );
}

export default function WorldBuilder({ rooms }: { rooms: WorldRoom[] }) {
  const placeable = useMemo(() => rooms.filter(r => r.modelUrl), [ rooms ]);
  const roomById = useMemo(() => new Map(rooms.map(r => [ r.id, r ])), [ rooms ]);
  const [ placed, setPlaced ] = useState<Placed[]>([]);
  const [ selected, setSelected ] = useState<string | null>(null);
  const [ placing, setPlacing ] = useState<WorldRoom | null>(null);
  // Exhibition spawn point: where visitors enter the Hyperfy world. Set by
  // clicking the ground in "set spawn" mode; travels with layout + export.
  const [ spawnPoint, setSpawnPoint ] = useState<{ position: [number, number, number]; rotationY: number } | null>(null);
  const [ settingSpawn, setSettingSpawn ] = useState(false);
  // Placement ghost lives outside React state: pointer moves write the group's
  // transform directly (see Ghost) so placing mode costs zero re-renders.
  const ghostRef = useRef<THREE.Group>(null);
  const ghostState = useRef<{ pos: [number, number, number]; rotY: number }>({
    pos: [ 0, 0, 0 ],
    rotY: 0,
  });
  const [ showHelp, setShowHelp ] = useState(false);
  const [ tab, setTab ] = useState<SidebarTab>("build");
  const [ collapsed, setCollapsed ] = useState(false);
  const draggingRef = useRef<string | null>(null);
  const camApi = useRef<CameraApi | null>(null);
  const counter = useRef(0);
  // Camera-director datapoints: live placement list + measured room bounds,
  // read imperatively by the rig's framing verbs.
  const placedRef = useRef<Placed[]>([]);
  const roomBoundsRef = useRef<Record<string, RoomWorldBounds>>({});
  const handleBounds = useCallback((uid: string, b: RoomWorldBounds) => {
    roomBoundsRef.current[uid] = b;
  }, []);
  // Stable identity for this exhibition — the Hyperfy spawners derive
  // deterministic ids from it so re-spawning updates worlds in place.
  const exhibitionIdRef = useRef(newExhibitionId());
  // Raw GLB measurements per placement (footprint + ground offset), lifted
  // from the loaded models — Hyperfy exports carry them so spawners can
  // reproduce the builder's tile layout at world scale.
  const roomNormsRef = useRef<Record<string, RoomNorm>>({});
  const handleMeasure = useCallback((uid: string, norm: RoomNorm) => {
    roomNormsRef.current[uid] = norm;
  }, []);

  // --- Curate mode: hang artworks on a placed room's wall slots -------------
  // assignments: placement uid → (slotId → artwork). overrides: placement uid →
  // (slotId → move/resize adjustment). Both persisted to localStorage.
  const [ assignments, setAssignments ] = useState<Record<string, Assignments>>({});
  const [ overrides, setOverrides ] = useState<Record<string, SlotOverrides>>({});
  const [ curatingUid, setCuratingUid ] = useState<string | null>(null);
  const [ activeSlotId, setActiveSlotId ] = useState<string | null>(null);
  // World-resolved slots per placed room (for the sidebar navigator + fly-to).
  const [ roomSlots, setRoomSlots ] = useState<Record<string, SlotWorld[]>>({});
  const [ autoBusy, setAutoBusy ] = useState(false);
  // State (not a ref) so the persist effect only runs in renders *after* the
  // restored layout has flushed — a ref flips synchronously inside the hydrate
  // effect and lets the very first persist pass save the initial empty state
  // over the stored layout (StrictMode's double effect run then re-hydrates
  // from the wiped storage and the layout is lost).
  const [ hydrated, setHydrated ] = useState(false);

  // Restore a layout (initial hydration or loading a saved exhibit).
  const applyLayout = useCallback(
    (layout: WorldLayout) => {
      const restored: Placed[] = [];
      const restoredAssign: Record<string, Assignments> = {};
      const restoredOv: Record<string, SlotOverrides> = {};
      let maxN = 0;
      for (const p of layout.placements) {
        const room = roomById.get(p.roomId);
        if (!room?.modelUrl) continue;
        restored.push({ uid: p.uid, room, position: p.position, rotationY: p.rotationY, scale: p.scale });
        if (p.assignments && Object.keys(p.assignments).length) {
          restoredAssign[p.uid] = p.assignments;
        }
        if (p.overrides && Object.keys(p.overrides).length) {
          restoredOv[p.uid] = p.overrides;
        }
        const n = Number(p.uid.replace(/^p/, ""));
        if (Number.isFinite(n)) maxN = Math.max(maxN, n + 1);
      }
      counter.current = Math.max(counter.current, maxN);
      exhibitionIdRef.current = layout.exhibitionId || newExhibitionId();
      setSpawnPoint(layout.spawn ?? null);
      // Mirror synchronously so camera verbs fired right after a load (e.g.
      // frameExhibition) already see the restored placements.
      placedRef.current = restored;
      roomBoundsRef.current = {};
      setPlaced(restored);
      setAssignments(restoredAssign);
      setOverrides(restoredOv);
      setSelected(null);
      setPlacing(null);
      setCuratingUid(null);
      setActiveSlotId(null);
    },
    [ roomById ],
  );

  // Snapshot the current working layout (persistence + exhibit saves).
  const buildLayout = useCallback(
    (): WorldLayout => ({
      version: 2,
      exhibitionId: exhibitionIdRef.current,
      placements: placed.map(p => ({
        uid: p.uid,
        roomId: p.room.id,
        position: p.position,
        rotationY: p.rotationY,
        scale: p.scale,
        assignments: assignments[p.uid] || {},
        overrides: overrides[p.uid] || {},
      })),
      spawn: spawnPoint ?? undefined,
    }),
    [ placed, assignments, overrides, spawnPoint ],
  );

  // Hydrate the saved layout once on mount (rooms come from the server props).
  useEffect(() => {
    const layout = loadWorldLayout();
    if (layout) applyLayout(layout);
    setHydrated(true);
  }, [ applyLayout ]);

  // Persist on any change to placements / assignments / overrides — and keep
  // the working exhibit's entry in the Exhibits library in sync (created as
  // "Unnamed exhibit" on first start; rename it in the Exhibits tab).
  useEffect(() => {
    if (!hydrated) return;
    const layout = buildLayout();
    saveWorldLayout(layout);
    syncCurrentExhibit(layout);
  }, [ hydrated, buildLayout ]);

  // Keep the camera director's placement mirror current on every commit.
  placedRef.current = placed;

  const curatingRoom = curatingUid ? placed.find(p => p.uid === curatingUid) : null;
  const curatingSlots = curatingUid ? roomSlots[curatingUid] || [] : [];
  const activeSlot = activeSlotId
    ? curatingSlots.find(s => s.id === activeSlotId) ?? null
    : null;
  const activeSlotLabel = activeSlot ? `Slot ${activeSlot.index}` : null;
  const activeArt
    = curatingUid && activeSlotId ? (assignments[curatingUid] || {})[activeSlotId] ?? null : null;
  const activeOverride
    = curatingUid && activeSlotId
      ? (overrides[curatingUid] || {})[activeSlotId] ?? DEFAULT_OVERRIDE
      : DEFAULT_OVERRIDE;

  // Fly the camera to stand head-on in front of a slot.
  const flyToSlot = (s: SlotWorld) => {
    const ovScale = curatingUid
      ? ((overrides[curatingUid] || {})[s.id]?.scale ?? 1)
      : 1;
    camApi.current?.focusSlot(s.position.clone(), s.normal.clone(), s.size * ovScale);
  };

  // Make sure the curate tools are on screen (slot clicks can come from the
  // 3D view while the sidebar is collapsed or on another tab).
  const revealCurateTab = () => {
    setCollapsed(false);
    setTab("curate");
  };

  const selectSlot = (slotId: string) => {
    setActiveSlotId(slotId);
    revealCurateTab();
    const s = curatingSlots.find(x => x.id === slotId);
    if (s) flyToSlot(s);
  };

  const enterCurate = (uid: string) => {
    setCuratingUid(uid);
    setSelected(uid);
    setPlacing(null);
    setActiveSlotId(null);
    revealCurateTab();
    if (!camApi.current) return;

    // Come in close: frame the wall of slots facing the camera's current
    // angle, so the first "where does art go" decision is right in view.
    const slots = roomSlots[uid] || [];
    if (slots.length) {
      const { yaw } = camApi.current.getGoal();
      // The camera sits on the +dir side of its target — a slot whose normal
      // points along dir faces the viewer.
      const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      let best: SlotWorld | null = null;
      let bestFacing = Number.NEGATIVE_INFINITY;
      for (const s of slots) {
        const n = s.normal.clone().setY(0);
        if (n.lengthSq() < 1e-6) continue;
        const facing = n.normalize().dot(dir);
        if (facing > bestFacing) {
          bestFacing = facing;
          best = s;
        }
      }
      if (best) {
        const wallNormal = best.normal.clone().setY(0).normalize();
        // Frame from the wall's middle-most slot: a real anchor ON a wall
        // surface, so the obstacle ray behaves — synthetic centroids can sit
        // in mid-air or inside geometry and strand the camera in the room.
        const wall = slots.filter((s) => {
          const n = s.normal.clone().setY(0);
          return n.lengthSq() > 1e-6 && n.normalize().dot(wallNormal) > 0.85;
        });
        const centroid = wall
          .reduce((acc, s) => acc.add(s.position), new THREE.Vector3())
          .divideScalar(wall.length);
        let anchor = best;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const s of wall) {
          const d = s.position.distanceTo(centroid);
          if (d < bestDist) {
            bestDist = d;
            anchor = s;
          }
        }
        let spread = 0;
        for (const s of wall) spread = Math.max(spread, anchor.position.distanceTo(s.position));
        const maxSize = Math.max(...wall.map(s => s.size));
        camApi.current.focusSlot(
          anchor.position.clone(),
          anchor.normal.clone(),
          clamp(maxSize + spread * 0.5, maxSize, 5),
        );
        return;
      }
    }
    // Model still loading (no measured slots yet) — frame the room itself.
    camApi.current.frameRoom(uid);
  };

  const exitCurate = () => {
    setCuratingUid(null);
    setActiveSlotId(null);
  };

  // Select a room from the sidebar (or re-focus an already selected one).
  const selectAndFocus = (uid: string) => {
    setSelected(uid);
    camApi.current?.frameRoom(uid);
  };

  // Clicking the ROOMs tab while curating steps back out: the sidebar
  // returns to the room list and the camera lifts to a bird's eye over the
  // room you were working on.
  const handleTabChange = (next: SidebarTab) => {
    if (next === "curate" && tab === "curate" && curatingUid) {
      const uid = curatingUid;
      exitCurate();
      camApi.current?.birdsEye(uid);
      return;
    }
    setTab(next);
  };

  // Curator room sizing — multiplies the tile-normalized room.
  const scaleRoom = (uid: string, dir: 1 | -1) => {
    setPlaced(p =>
      p.map(it =>
        it.uid === uid
          ? { ...it, scale: clamp((it.scale || 1) + dir * ROOM_SCALE_STEP, ROOM_SCALE_MIN, ROOM_SCALE_MAX) }
          : it,
      ),
    );
  };

  const rotateRoom = (uid: string, dir: 1 | -1 = 1) => {
    setPlaced(p =>
      p.map(it => (it.uid === uid ? { ...it, rotationY: it.rotationY + dir * (Math.PI / 4) } : it)),
    );
  };

  const removeRoom = (uid: string) => {
    delete roomBoundsRef.current[uid];
    setPlaced(p => p.filter(x => x.uid !== uid));
    setAssignments((a) => {
      const next = { ...a };
      delete next[uid];
      return next;
    });
    setOverrides((o) => {
      const next = { ...o };
      delete next[uid];
      return next;
    });
    setRoomSlots((r) => {
      const next = { ...r };
      delete next[uid];
      return next;
    });
    if (curatingUid === uid) exitCurate();
    setSelected(s => (s === uid ? null : s));
  };

  const clearWorld = () => {
    if (!window.confirm("Clear the whole world? (Saved exhibits are kept.)")) return;
    exhibitionIdRef.current = newExhibitionId(); // a cleared world is a new show
    roomBoundsRef.current = {};
    setPlaced([]);
    setAssignments({});
    setOverrides({});
    setRoomSlots({});
    setSelected(null);
    setCuratingUid(null);
    setActiveSlotId(null);
  };

  const assignArt = (art: NftView) => {
    if (!curatingUid) return;
    // No slot picked? The first free slot takes the work (slot 1 on a fresh
    // room) and becomes active — the easiest possible first hang.
    if (!activeSlotId) {
      const slots = roomSlots[curatingUid] || [];
      const current = assignments[curatingUid] || {};
      const target = slots.find(s => !current[s.id]) ?? slots[0];
      if (!target) return;
      setAssignments(prev => ({
        ...prev,
        [curatingUid]: { ...(prev[curatingUid] || {}), [target.id]: art },
      }));
      setActiveSlotId(target.id);
      flyToSlot(target);
      return;
    }
    setAssignments(prev => ({
      ...prev,
      [curatingUid]: { ...(prev[curatingUid] || {}), [activeSlotId]: art },
    }));
    setActiveSlotId(null);
  };

  const setSlotOverride = (uid: string, slotId: string, next: SlotOverride) => {
    setOverrides(prev => ({
      ...prev,
      [uid]: { ...(prev[uid] || {}), [slotId]: next },
    }));
  };

  const resetSlotOverride = (uid: string, slotId: string) => {
    setOverrides((prev) => {
      const forUid = { ...(prev[uid] || {}) };
      delete forUid[slotId];
      return { ...prev, [uid]: forUid };
    });
  };

  const clearSlot = (uid: string, slotId: string) => {
    setAssignments((prev) => {
      const next = { ...(prev[uid] || {}) };
      delete next[slotId];
      return { ...prev, [uid]: next };
    });
    resetSlotOverride(uid, slotId);
  };

  const scaleActive = (dir: 1 | -1) => {
    if (!curatingUid || !activeSlotId) return;
    setSlotOverride(curatingUid, activeSlotId, {
      ...activeOverride,
      scale: clamp(activeOverride.scale + dir * SCALE_STEP, MIN_ART_SCALE, MAX_ART_SCALE),
    });
  };

  const buildExhibition = () =>
    buildHyperfyExhibition({
      id: exhibitionIdRef.current,
      spawn: spawnPoint ?? undefined,
      // The exhibit's name from the Exhibits tab — "Unnamed exhibit" until
      // the curator renames it. Travels into spawns, exports and the guide.
      name: currentExhibitName(exhibitionIdRef.current),
      placed,
      assignments,
      overrides,
      norms: roomNormsRef.current,
    });

  const exportHyperfy = () => downloadHyperfyExhibition(buildExhibition());

  const [ spawnOpen, setSpawnOpen ] = useState(false);
  const [ guideOpen, setGuideOpen ] = useState(false);

  const handleLoadExhibit = (layout: WorldLayout) => {
    if (
      placed.length > 0
      && !window.confirm(
        "Load this exhibit? Your current world will be replaced (save it first if you want to keep it).",
      )
    ) {
      return;
    }
    applyLayout(layout);
    camApi.current?.frameExhibition();
  };

  // Latest handlers behind permanently-stable wrappers: the memoized
  // PlacedRoom subtrees (the heaviest part of the scene) only re-render when
  // data that actually concerns them changes, never because a parent render
  // minted new callback identities.
  const actionsRef = useRef({
    select: (uid: string) => setSelected(uid),
    curate: enterCurate,
    slotClick: selectSlot,
    artSelect: (slotId: string) => setActiveSlotId(slotId),
    overrideChange: setSlotOverride,
  });
  actionsRef.current = {
    select: uid => setSelected(uid),
    curate: enterCurate,
    slotClick: selectSlot,
    artSelect: slotId => setActiveSlotId(slotId),
    overrideChange: setSlotOverride,
  };
  const onRoomSelect = useCallback((uid: string) => actionsRef.current.select(uid), []);
  const onRoomFocus = useCallback((uid: string) => actionsRef.current.curate(uid), []);
  const onRoomStartDrag = useCallback((uid: string) => {
    draggingRef.current = uid;
  }, []);
  const onSlotClickStable = useCallback((slot: RoomSlot) => actionsRef.current.slotClick(slot.id), []);
  const onArtSelectStable = useCallback((slot: RoomSlot) => actionsRef.current.artSelect(slot.id), []);
  const onOverrideChangeStable = useCallback(
    (uid: string, slotId: string, next: SlotOverride) => actionsRef.current.overrideChange(uid, slotId, next),
    [],
  );
  const onSlotsReadyStable = useCallback((uid: string, slots: SlotWorld[]) => {
    setRoomSlots(prev => (prev[uid] === slots ? prev : { ...prev, [uid]: slots }));
  }, []);

  // Placed rooms reduced to what the sidebar renders (titles + fill counts).
  const placedSummaries: PlacedSummary[] = placed.map(p => ({
    uid: p.uid,
    title: p.room.title,
    architect: p.room.architect,
    slotsTotal: (roomSlots[p.uid] || []).length,
    slotsFilled: Object.keys(assignments[p.uid] || {}).length,
    scale: p.scale || 1,
  }));

  // What the sidebar's artwork browser is currently filtered to — auto-fill
  // draws from exactly this scope, so the curator controls what flows in.
  const browserQueryRef = useRef<{ slugs: string | null; search: string }>({ slugs: null, search: "" });

  // Auto-curate: fill every empty slot of the curated room, one piece at a
  // time, from the browser's CURRENT filter (collection scope + search).
  // Never overwrites hung works. While it runs, the camera slowly orbits the
  // room so the curator watches the show assemble.
  const autoPopulate = async () => {
    if (!curatingUid || autoBusy) return;
    const uid = curatingUid;
    const slots = roomSlots[uid] || [];
    const current = assignments[uid] || {};
    const empty = slots.filter(s => !current[s.id]);
    if (!empty.length) return;
    setAutoBusy(true);
    try {
      // Pool from the filtered browser scope, skipping works already hung in
      // this room. Unfiltered scope still randomizes its starting page so
      // repeated runs vary.
      const q = browserQueryRef.current;
      const hung = new Set(Object.values(current).map(a => a.id));
      const filtered = !!(q.slugs || q.search.trim());
      const pool: NftView[] = [];
      const seen = new Set<number>();
      const startPage = filtered ? 1 : 1 + Math.floor(Math.random() * 20);
      for (let i = 0; i < 8 && pool.length < empty.length; i++) {
        const params = new URLSearchParams();
        if (q.slugs) params.set("slugs", q.slugs);
        if (q.search.trim()) params.set("search", q.search.trim());
        params.set("page", String(startPage + i));
        const res = await fetch(`/api/museum/artworks?${params.toString()}`);
        if (!res.ok) break;
        const data = (await res.json()) as { artworks: NftView[] };
        if (!data.artworks?.length) break;
        for (const a of data.artworks) {
          if (!seen.has(a.id) && !hung.has(a.id)) {
            seen.add(a.id);
            pool.push(a);
          }
        }
      }
      if (!pool.length) return;
      if (!filtered) {
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [ pool[i], pool[j] ] = [ pool[j], pool[i] ];
        }
      }

      // Pull the camera into an orbit around the room, then hang piece by
      // piece — snappy steps, slow turn, the room fills before your eyes.
      camApi.current?.frameRoom(uid);
      const count = Math.min(empty.length, pool.length);
      for (let i = 0; i < count; i++) {
        const slot = empty[i];
        const art = pool[i];
        setAssignments(prev => ({
          ...prev,
          [uid]: { ...(prev[uid] || {}), [slot.id]: art },
        }));
        camApi.current?.orbitBy(Math.PI / Math.max(count, 8));
        await new Promise(resolve => setTimeout(resolve, 240));
      }
    } finally {
      setAutoBusy(false);
    }
  };

  // Keyboard shortcuts: R rotate (Shift reverses), C curate, Del/Backspace
  // remove, F focus, Esc step back one mode, Home reset view, H help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.code === "KeyR") {
        const dir = e.shiftKey ? -1 : 1;
        if (placing) {
          ghostState.current.rotY += dir * (Math.PI / 4);
          ghostRef.current?.rotation.set(0, ghostState.current.rotY, 0);
        } else if (selected) {
          rotateRoom(selected, dir);
        }
      } else if (e.code === "KeyC") {
        if (!curatingUid && selected) enterCurate(selected);
      } else if (e.code === "Delete" || e.code === "Backspace") {
        // In curate mode, Del clears the hung artwork on the active slot.
        if (curatingUid && activeSlotId) {
          clearSlot(curatingUid, activeSlotId);
          setActiveSlotId(null);
        } else if (selected) {
          removeRoom(selected);
        }
      } else if (e.code === "KeyF") {
        if (selected) selectAndFocus(selected);
      } else if (e.code === "Escape") {
        // Step back one layer at a time: spawn mode → placing → active slot
        // → curate mode → help panel → selection.
        if (settingSpawn) {
          setSettingSpawn(false);
        } else if (placing) {
          setPlacing(null);
        } else if (curatingUid && activeSlotId) {
          setActiveSlotId(null);
        } else if (curatingUid) {
          exitCurate();
        } else if (showHelp) {
          setShowHelp(false);
        } else {
          setSelected(null);
        }
      } else if (e.code === "Home") {
        camApi.current?.frameExhibition();
      } else if (e.code === "KeyH") {
        setShowHelp(v => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Right-click cancels placement mode (classic RTS affordance).
  useEffect(() => {
    if (!placing) return;
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) setPlacing(null);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [ placing ]);

  const placeAt = (x: number, z: number) => {
    if (!placing) return;
    const uid = `p${counter.current++}`;
    setPlaced(p => [
      ...p,
      { uid, room: placing, position: [ snap(x), 0, snap(z) ], rotationY: ghostState.current.rotY, scale: DEFAULT_ROOM_SCALE },
    ]);
    setSelected(uid);
    // stay in placement mode for rapid building (Esc / right-click to stop)
  };

  // Overlays sit beside the sidebar, not under it.
  const sidebarWidth = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <div
      className="relative h-full w-full"
      style={{ background: "#070707", cursor: placing ? "crosshair" : undefined }}
    >
      <Canvas
        shadows
        dpr={[ 1, 2 ]}
        camera={{ position: [ 32, 30, 32 ], fov: 42 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={(e) => {
          if ((e as MouseEvent).button === 0) setSelected(null);
        }}
      >
        <color attach="background" args={[ "#070707" ]} />
        <fog attach="fog" args={[ "#070707", 70, 200 ]} />
        <hemisphereLight intensity={0.45} groundColor="#050505" />
        <directionalLight
          position={[ 30, 40, 15 ]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[ 2048, 2048 ]}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
        />

        <Grid
          args={[ 600, 600 ]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#1c1c1c"
          sectionSize={TILE}
          sectionThickness={1}
          sectionColor="#3a3320"
          fadeDistance={260}
          fadeStrength={1.5}
          infiniteGrid
        />

        {/* Ground: click target for placement / dragging / deselect */}
        <mesh
          rotation={[ -Math.PI / 2, 0, 0 ]}
          position={[ 0, 0, 0 ]}
          onPointerMove={(e) => {
            if (placing) {
              // Imperative ghost update — no React re-render per mousemove.
              ghostState.current.pos = [ e.point.x, 0, e.point.z ];
              ghostRef.current?.position.set(e.point.x, 0, e.point.z);
            } else if (draggingRef.current) {
              const id = draggingRef.current;
              const sx = snap(e.point.x);
              const sz = snap(e.point.z);
              // Positions are grid-snapped — skip the state update (and the
              // full re-render it costs) until the room crosses a grid step.
              setPlaced((p) => {
                const it = p.find(x => x.uid === id);
                if (!it || (it.position[0] === sx && it.position[2] === sz)) return p;
                return p.map(x => (x.uid === id ? { ...x, position: [ sx, 0, sz ] } : x));
              });
            }
          }}
          onPointerUp={() => (draggingRef.current = null)}
          onClick={(e) => {
            if (settingSpawn) {
              e.stopPropagation();
              // Visitors face the exhibition center from where they appear.
              setSpawnPoint({
                position: [ e.point.x, 0, e.point.z ],
                rotationY: Math.atan2(-e.point.x, -e.point.z),
              });
              setSettingSpawn(false);
            } else if (placing) {
              e.stopPropagation();
              placeAt(e.point.x, e.point.z);
            }
          }}
        >
          <planeGeometry args={[ 2000, 2000 ]} />
          <meshStandardMaterial color="#0b0b0b" roughness={1} />
        </mesh>

        {placing && (
          <Ghost
            ref={ghostRef}
            initialPos={ghostState.current.pos}
            initialRotY={ghostState.current.rotY}
          />
        )}

        {/* Exhibition spawn point — where visitors enter the Hyperfy world. */}
        {spawnPoint && (
          <group position={spawnPoint.position} rotation={[ 0, spawnPoint.rotationY, 0 ]}>
            <mesh rotation={[ -Math.PI / 2, 0, 0 ]} position={[ 0, 0.02, 0 ]}>
              <ringGeometry args={[ 0.7, 0.95, 40 ]} />
              <meshBasicMaterial color="#9effa5" transparent opacity={0.9} />
            </mesh>
            <mesh position={[ 0, 0.02, -1.25 ]} rotation={[ -Math.PI / 2, 0, Math.PI ]}>
              <coneGeometry args={[ 0.28, 0.7, 3 ]} />
              <meshBasicMaterial color="#9effa5" transparent opacity={0.9} />
            </mesh>
            <mesh position={[ 0, 0.6, 0 ]}>
              <cylinderGeometry args={[ 0.03, 0.03, 1.2, 8 ]} />
              <meshBasicMaterial color="#9effa5" />
            </mesh>
          </group>
        )}

        <Suspense fallback={null}>
          {placed.map(p => (
            <Suspense
              key={p.uid}
              fallback={
                <Html position={p.position} center>
                  <span className={`
                    rounded bg-black/60 px-2 py-1 text-[10px] text-white/70
                  `}>loading…</span>
                </Html>
              }
            >
              <PlacedRoom
                placed={p}
                selected={selected === p.uid}
                curating={curatingUid === p.uid}
                assignments={assignments[p.uid] || EMPTY_ASSIGNMENTS}
                overrides={overrides[p.uid] || EMPTY_OVERRIDES}
                activeSlotId={curatingUid === p.uid ? activeSlotId : null}
                onSelect={onRoomSelect}
                onFocus={onRoomFocus}
                onStartDrag={onRoomStartDrag}
                onSlotClick={onSlotClickStable}
                onArtSelect={onArtSelectStable}
                onOverrideChange={onOverrideChangeStable}
                onSlotsReady={onSlotsReadyStable}
                onMeasure={handleMeasure}
                onBounds={handleBounds}
              />
            </Suspense>
          ))}
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={1.8} position={[ 0, 12, -6 ]} scale={[ 24, 10, 1 ]} color="#ffffff" />
            <Lightformer intensity={1} position={[ -12, 6, 6 ]} scale={[ 12, 12, 1 ]} color="#bcd0ff" />
          </Environment>
        </Suspense>

        <RTSControls apiRef={camApi} boundsRef={roomBoundsRef} placedRef={placedRef} />
        <AdaptiveDpr pixelated />
      </Canvas>

      {/* Unified exhibition management sidebar */}
      <BuilderSidebar
        tab={tab}
        onTabChange={handleTabChange}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(v => !v)}
        rooms={placeable}
        placingId={placing?.id ?? null}
        onTogglePlacing={(r) => {
          setPlacing(cur => (cur?.id === r.id ? null : r));
          setSelected(null);
        }}
        placed={placedSummaries}
        selectedUid={selected}
        onSelectRoom={selectAndFocus}
        onRotateRoom={uid => rotateRoom(uid)}
        onRemoveRoom={removeRoom}
        onCurate={enterCurate}
        onClearWorld={clearWorld}
        curating={curatingRoom ? { uid: curatingRoom.uid, title: curatingRoom.room.title } : null}
        slots={curatingSlots}
        curAssignments={curatingUid ? assignments[curatingUid] || {} : {}}
        activeSlotId={activeSlotId}
        onSelectSlot={selectSlot}
        onExitCurate={exitCurate}
        onAutoFill={autoPopulate}
        onScaleRoom={scaleRoom}
        onSetSpawn={() => {
          setSettingSpawn(true);
          setPlacing(null);
        }}
        onClearSpawn={() => setSpawnPoint(null)}
        hasSpawn={!!spawnPoint}
        onBrowserQuery={(q) => {
          browserQueryRef.current = q;
        }}
        autoBusy={autoBusy}
        activeArt={activeArt}
        activeScale={activeOverride.scale}
        canScaleUp={activeOverride.scale < MAX_ART_SCALE - 1e-6}
        canScaleDown={activeOverride.scale > MIN_ART_SCALE + 1e-6}
        onScaleActive={scaleActive}
        onResetActive={() => curatingUid && activeSlotId && resetSlotOverride(curatingUid, activeSlotId)}
        onClearActive={() => {
          if (curatingUid && activeSlotId) {
            clearSlot(curatingUid, activeSlotId);
            setActiveSlotId(null);
          }
        }}
        onPickArt={assignArt}
        getLayout={buildLayout}
        hasContent={placed.length > 0}
        onLoadLayout={handleLoadExhibit}
        onExport={exportHyperfy}
        onSpawn={() => setSpawnOpen(true)}
        onGuide={() => setGuideOpen(true)}
      />

      {/* Set-spawn banner */}
      {settingSpawn && !placing && (
        <div
          className={`
            pointer-events-none absolute top-3 z-20 flex justify-center
          `}
          style={{ left: sidebarWidth, right: 0 }}
        >
          <div
            className="rounded-full px-4 py-1.5 text-xs"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Click the ground to set where visitors spawn · Esc cancels
          </div>
        </div>
      )}

      {/* Mode banner (centered over the 3D viewport, not the full window) */}
      {placing && (
        <div
          className={`
            pointer-events-none absolute top-3 z-20 flex justify-center
          `}
          style={{ left: sidebarWidth, right: 0 }}
        >
          <div
            className="rounded-full px-4 py-1.5 text-xs"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Placing “{placing.title}” · click the ground to drop · R rotates · right-click to stop
          </div>
        </div>
      )}

      {/* Curate banner */}
      {curatingRoom && !placing && (
        <div
          className={`
            pointer-events-none absolute top-3 z-20 flex justify-center
          `}
          style={{ left: sidebarWidth, right: 0 }}
        >
          <div
            className="rounded-full px-4 py-1.5 text-xs"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Curating “{curatingRoom.room.title}” ·{" "}
            {activeArt
              ? "drag to move · corner dot to resize"
              : activeSlotId
                ? `pick a work for ${activeSlotLabel}`
                : "pick a work in the sidebar or click a glowing slot"}{" "}
            · Esc to finish
          </div>
        </div>
      )}

      {/* Bottom-right: zoom / reset-view cluster + controls reference */}
      <ControlsHelp
        open={showHelp}
        onToggle={() => setShowHelp(v => !v)}
        onClose={() => setShowHelp(false)}
        onResetView={() => camApi.current?.frameExhibition()}
        onZoomIn={() => camApi.current?.zoomBy(1 / 1.35)}
        onZoomOut={() => camApi.current?.zoomBy(1.35)}
      />

      {/* Spawn the exhibition into a self-hosted Hyperfy world */}
      <SpawnHyperfyDialog
        open={spawnOpen}
        onClose={() => setSpawnOpen(false)}
        buildExhibition={buildExhibition}
      />

      {/* Send the AI museum guide into the exhibition (persona picker) */}
      <GuideDialog
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        buildExhibition={buildExhibition}
      />
    </div>
  );
}
