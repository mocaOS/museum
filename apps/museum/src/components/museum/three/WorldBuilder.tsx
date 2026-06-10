"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Environment, Lightformer, Html, useGLTF, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import type { NftView } from "@/lib/museum/media";
import ArtworkPlane from "./ArtworkPlane";
import ArtworkPicker from "./ArtworkPicker";
import { extractSlots, setPlaceholdersVisible, type RoomSlot } from "./slots";
import {
  loadWorldLayout,
  saveWorldLayout,
  type Assignments,
} from "./world-storage";

export interface WorldRoom {
  id: number;
  title: string;
  architect?: string | null;
  modelUrl?: string;
  imageUrl?: string;
}

interface Placed {
  uid: string;
  room: WorldRoom;
  position: [number, number, number];
  rotationY: number;
}

const TILE = 8;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (v: number) => Math.round(v / 2) * 2;

export interface CameraApi {
  focus: (p: THREE.Vector3) => void;
  /** Fly to stand in front of a wall slot, looking straight at it. */
  focusSlot: (pos: THREE.Vector3, normal: THREE.Vector3, size: number) => void;
  reset: () => void;
}

/** A slot resolved into world space, for the sidebar navigator + filling. */
export interface SlotWorld {
  id: string;
  index: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  size: number;
}

// --- Custom RTS / city-builder camera ---------------------------------------
// Spring-arm rig: a ground `target` + yaw/pitch/distance. WASD/arrows pan,
// Q/E rotate, wheel zoom, RMB-drag orbit, MMB-drag pan, screen-edge scroll.
function RTSControls({ apiRef }: { apiRef: React.MutableRefObject<CameraApi | null> }) {
  const { camera, gl, scene } = useThree();
  const ray = useRef(new THREE.Raycaster());
  const s = useRef({
    target: new THREE.Vector3(0, 0, 0),
    yaw: Math.PI / 4,
    pitch: THREE.MathUtils.degToRad(20),
    dist: 46,
    keys: new Set<string>(),
    drag: null as null | "rotate" | "pan",
    last: { x: 0, y: 0 },
    edge: { x: 0, y: 0 },
  });

  useEffect(() => {
    apiRef.current = {
      focus: (p) => s.current.target.lerp(new THREE.Vector3(p.x, 0, p.z), 1),
      focusSlot: (pos, normal, size) => {
        // Aim the rig at the artwork itself (not the ground) and stand a short
        // distance out along the wall normal, roughly eye-level and head-on.
        const n = normal.clone().setY(0);
        if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
        n.normalize();
        s.current.target.copy(pos);
        // Camera offset = target + dir*dist where dir points from yaw/pitch.
        // We want to look along -normal, so place camera on the +normal side.
        const pitch = THREE.MathUtils.degToRad(6);
        s.current.yaw = Math.atan2(n.x, n.z);
        s.current.pitch = pitch;

        const desired = clamp(size * 2.2, 4, 22);

        // Obstacle avoidance: cast a ray from the artwork outward along the
        // exact camera direction; if a wall/pillar/other artwork sits between
        // the slot and the desired camera point, pull the camera in to just
        // short of it so nothing ever blocks the view.
        const dir = new THREE.Vector3(
          Math.sin(s.current.yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.cos(s.current.yaw) * Math.cos(pitch)
        ).normalize();
        // Start a touch out from the wall so we don't hit the slot's own frame.
        const start = pos.clone().addScaledVector(dir, 0.25);
        ray.current.set(start, dir);
        ray.current.far = desired;
        const hits = ray.current
          .intersectObjects(scene.children, true)
          .filter((h) => {
            const o = h.object as THREE.Mesh;
            // Ignore non-visible helpers, the ground plane, and unlit overlays
            // (slot markers / artwork planes use MeshBasicMaterial).
            if (!o.visible) return false;
            const mat = o.material as THREE.Material & { transparent?: boolean };
            if (mat && (mat as THREE.Material).type === "MeshBasicMaterial") return false;
            return true;
          });
        const MARGIN = 0.4;
        const blocked = hits.length ? Math.max(1.2, hits[0].distance + 0.25 - MARGIN) : desired;
        s.current.dist = Math.min(desired, blocked);
      },
      reset: () => {
        s.current.target.set(0, 0, 0);
        s.current.yaw = Math.PI / 4;
        s.current.pitch = THREE.MathUtils.degToRad(20);
        s.current.dist = 46;
      },
    };
  }, [apiRef]);

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
      s.current.dist = clamp(s.current.dist * (1 + Math.sign(e.deltaY) * 0.12), 8, 140);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 2) s.current.drag = "rotate";
      else if (e.button === 1) s.current.drag = "pan";
      if (s.current.drag) s.current.last = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => (s.current.drag = null);
    const onMove = (e: PointerEvent) => {
      const r = dom.getBoundingClientRect();
      const ex = e.clientX - r.left;
      const ey = e.clientY - r.top;
      const m = 36;
      s.current.edge.x = ex < m ? -1 : ex > r.width - m ? 1 : 0;
      s.current.edge.y = ey < m ? -1 : ey > r.height - m ? 1 : 0;
      if (s.current.drag) {
        const dx = e.clientX - s.current.last.x;
        const dy = e.clientY - s.current.last.y;
        s.current.last = { x: e.clientX, y: e.clientY };
        if (s.current.drag === "rotate") {
          s.current.yaw -= dx * 0.005;
          s.current.pitch = clamp(s.current.pitch + dy * 0.005, 0.2, 1.45);
        } else {
          const k = s.current.dist * 0.0016;
          const yaw = s.current.yaw;
          const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
          const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
          s.current.target.addScaledVector(rt, -dx * k).addScaledVector(f, dy * k);
        }
      }
    };
    const onLeave = () => (s.current.edge = { x: 0, y: 0 });
    const onCtx = (e: Event) => e.preventDefault();

    dom.addEventListener("wheel", onWheel, { passive: false });
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    dom.addEventListener("pointerleave", onLeave);
    dom.addEventListener("contextmenu", onCtx);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      dom.removeEventListener("wheel", onWheel);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
      dom.removeEventListener("pointerleave", onLeave);
      dom.removeEventListener("contextmenu", onCtx);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gl]);

  useFrame((_, dt) => {
    const c = s.current;
    const yaw = c.yaw;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const rt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const speed = c.dist * 1.1 * dt * (c.keys.has("ShiftLeft") || c.keys.has("ShiftRight") ? 2.2 : 1);
    const mv = new THREE.Vector3();
    if (c.keys.has("KeyW") || c.keys.has("ArrowUp")) mv.add(f);
    if (c.keys.has("KeyS") || c.keys.has("ArrowDown")) mv.sub(f);
    if (c.keys.has("KeyD") || c.keys.has("ArrowRight")) mv.add(rt);
    if (c.keys.has("KeyA") || c.keys.has("ArrowLeft")) mv.sub(rt);
    mv.addScaledVector(rt, c.edge.x).addScaledVector(f, -c.edge.y);
    if (mv.lengthSq() > 0) c.target.addScaledVector(mv.normalize(), speed);
    if (c.keys.has("KeyQ")) c.yaw += dt * 1.3;
    if (c.keys.has("KeyE")) c.yaw -= dt * 1.3;

    const offset = new THREE.Vector3(
      Math.sin(c.yaw) * Math.cos(c.pitch),
      Math.sin(c.pitch),
      Math.cos(c.yaw) * Math.cos(c.pitch)
    ).multiplyScalar(c.dist);
    camera.position.lerp(c.target.clone().add(offset), 1 - Math.pow(0.001, dt));
    camera.lookAt(c.target);
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
  return (
    <group position={slot.position.clone().add(inwardOffset)} quaternion={orientation}>
      <mesh
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          onClick();
        }}
      >
        <planeGeometry args={[slot.width, slot.height]} />
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
        <edgesGeometry args={[new THREE.PlaneGeometry(slot.width, slot.height)]} />
        <lineBasicMaterial color={active ? "#e0b24d" : "#5fb0ff"} transparent opacity={0.95} depthTest={false} />
      </lineSegments>
    </group>
  );
}

// Build an upright orientation that makes a slot's plane face the room interior.
// Authored slot normals (local +Z) sometimes point outward; we flip when they
// face away from the room center, and re-level "up" to world up so works hang
// straight regardless of how the placeholder was authored.
function inwardOrientation(slot: RoomSlot, centerXZ: THREE.Vector3): THREE.Quaternion {
  const authored = slot.quaternion.clone();
  const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(authored);
  const toCenter = new THREE.Vector3(centerXZ.x - slot.position.x, 0, centerXZ.z - slot.position.z);
  if (toCenter.lengthSq() > 1e-6 && normal.dot(toCenter) < 0) {
    authored.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
  }
  return authored;
}

function PlacedRoom({
  placed,
  selected,
  curating,
  assignments,
  activeSlotId,
  onSelect,
  onStartDrag,
  onSlotClick,
  onSlotsReady,
}: {
  placed: Placed;
  selected: boolean;
  curating: boolean;
  assignments: Assignments;
  activeSlotId: string | null;
  onSelect: () => void;
  onStartDrag: () => void;
  onSlotClick: (slot: RoomSlot) => void;
  onSlotsReady: (uid: string, slots: SlotWorld[]) => void;
}) {
  const { scene } = useGLTF(placed.room.modelUrl!, true, true);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const slots = useMemo(() => extractSlots(cloned), [cloned]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  // Hide the placeholder quads in the model — we draw our own markers/artworks.
  useEffect(() => {
    setPlaceholdersVisible(cloned, false);
  }, [cloned]);

  const { scale, offset, center } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const c = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(c);
    const s = TILE / (Math.max(size.x, size.z) || 1);
    return { scale: s, offset: new THREE.Vector3(-c.x, -box.min.y, -c.z), center: c };
  }, [cloned]);

  // Per-slot inward orientation in room-local space (shared by marker + art).
  const oriented = useMemo(
    () => slots.map((s) => ({ slot: s, quat: inwardOrientation(s, center) })),
    [slots, center]
  );

  // Resolve every slot into world space for the sidebar navigator + camera fly.
  // World = outer(placement) ∘ inner(scale/offset) ∘ slotLocal.
  const worldSlots = useMemo<SlotWorld[]>(() => {
    const outer = new THREE.Matrix4().compose(
      new THREE.Vector3(...placed.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, placed.rotationY, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    const inner = new THREE.Matrix4().compose(
      new THREE.Vector3(offset.x * scale, offset.y * scale, offset.z * scale),
      new THREE.Quaternion(),
      new THREE.Vector3(scale, scale, scale)
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
  }, [oriented, placed.position, placed.rotationY, offset, scale]);

  useEffect(() => {
    onSlotsReady(placed.uid, worldSlots);
  }, [placed.uid, worldSlots, onSlotsReady]);

  // Small inward push so markers/art sit just off the wall (no z-fighting).
  const EPS = 0.06 / scale;

  return (
    <group
      position={placed.position}
      rotation={[0, placed.rotationY, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        // While curating, let clicks fall through to slot markers (which sit
        // in front of the wall); only the room body grabs select/drag.
        if (curating) {
          onSelect();
          return;
        }
        e.stopPropagation();
        onSelect();
        onStartDrag();
      }}
    >
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[TILE * 0.6, TILE * 0.72, 56]} />
          <meshBasicMaterial color="#e0b24d" transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Room geometry + its slots/artworks share the same scaled local space. */}
      <group scale={scale} position={[offset.x * scale, offset.y * scale, offset.z * scale]}>
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
              selected={curating && activeSlotId === slot.id}
              onSelect={curating ? () => onSlotClick(slot) : undefined}
            />
          );
        })}

        {/* Empty-slot markers (only while curating this room). */}
        {curating &&
          oriented
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
}

function Ghost({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  return (
    <group position={pos} rotation={[0, rotY, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <planeGeometry args={[TILE, TILE]} />
        <meshBasicMaterial color="#e0b24d" transparent opacity={0.18} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[TILE * 0.7, TILE * 0.72, 4]} />
        <meshBasicMaterial color="#e0b24d" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* facing arrow */}
      <mesh position={[0, 0.05, -TILE * 0.4]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.5, 3]} />
        <meshBasicMaterial color="#e0b24d" />
      </mesh>
    </group>
  );
}

export default function WorldBuilder({ rooms }: { rooms: WorldRoom[] }) {
  const placeable = useMemo(() => rooms.filter((r) => r.modelUrl), [rooms]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [placing, setPlacing] = useState<WorldRoom | null>(null);
  const [ghost, setGhost] = useState<{ pos: [number, number, number]; rotY: number }>({
    pos: [0, 0, 0],
    rotY: 0,
  });
  const [showHelp, setShowHelp] = useState(true);
  const draggingRef = useRef<string | null>(null);
  const camApi = useRef<CameraApi | null>(null);
  const counter = useRef(0);

  // --- Curate mode: hang artworks on a placed room's wall slots -------------
  // assignments: placement uid → (slotId → artwork). Persisted to localStorage.
  const [assignments, setAssignments] = useState<Record<string, Assignments>>({});
  const [curatingUid, setCuratingUid] = useState<string | null>(null);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  // World-resolved slots per placed room (for the sidebar navigator + fly-to).
  const [roomSlots, setRoomSlots] = useState<Record<string, SlotWorld[]>>({});
  const [autoBusy, setAutoBusy] = useState(false);
  const hydrated = useRef(false);

  // Hydrate the saved layout once on mount (rooms come from the server props).
  useEffect(() => {
    const layout = loadWorldLayout();
    if (!layout) {
      hydrated.current = true;
      return;
    }
    const restored: Placed[] = [];
    const restoredAssign: Record<string, Assignments> = {};
    let maxN = 0;
    for (const p of layout.placements) {
      const room = roomById.get(p.roomId);
      if (!room?.modelUrl) continue;
      restored.push({ uid: p.uid, room, position: p.position, rotationY: p.rotationY });
      if (p.assignments && Object.keys(p.assignments).length) {
        restoredAssign[p.uid] = p.assignments;
      }
      const n = Number(p.uid.replace(/^p/, ""));
      if (Number.isFinite(n)) maxN = Math.max(maxN, n + 1);
    }
    counter.current = maxN;
    setPlaced(restored);
    setAssignments(restoredAssign);
    hydrated.current = true;
  }, [roomById]);

  // Persist on any change to placements / assignments (after hydration).
  useEffect(() => {
    if (!hydrated.current) return;
    saveWorldLayout({
      version: 1,
      placements: placed.map((p) => ({
        uid: p.uid,
        roomId: p.room.id,
        position: p.position,
        rotationY: p.rotationY,
        assignments: assignments[p.uid] || {},
      })),
    });
  }, [placed, assignments]);

  const curatingRoom = curatingUid ? placed.find((p) => p.uid === curatingUid) : null;
  const curatingSlots = curatingUid ? roomSlots[curatingUid] || [] : [];
  const activeSlot = activeSlotId
    ? curatingSlots.find((s) => s.id === activeSlotId) ?? null
    : null;
  const activeSlotLabel = activeSlot ? `Slot ${activeSlot.index}` : null;

  // Fly the camera to stand head-on in front of a slot.
  const flyToSlot = (s: SlotWorld) => {
    camApi.current?.focusSlot(s.position.clone(), s.normal.clone(), s.size);
  };

  const selectSlot = (slotId: string) => {
    setActiveSlotId(slotId);
    const s = curatingSlots.find((x) => x.id === slotId);
    if (s) flyToSlot(s);
  };

  const enterCurate = (uid: string) => {
    setCuratingUid(uid);
    setSelected(uid);
    setPlacing(null);
    setActiveSlotId(null);
    const it = placed.find((p) => p.uid === uid);
    if (it && camApi.current) camApi.current.focus(new THREE.Vector3(...it.position));
  };

  const assignArt = (art: NftView) => {
    if (!curatingUid || !activeSlotId) return;
    setAssignments((prev) => ({
      ...prev,
      [curatingUid]: { ...(prev[curatingUid] || {}), [activeSlotId]: art },
    }));
    setActiveSlotId(null);
  };

  const clearSlot = (uid: string, slotId: string) => {
    setAssignments((prev) => {
      const next = { ...(prev[uid] || {}) };
      delete next[slotId];
      return { ...prev, [uid]: next };
    });
  };

  // Auto-curate: fill every empty slot of the curated room with random works
  // pulled from across all collections (paged to gather enough candidates).
  const autoPopulate = async () => {
    if (!curatingUid || autoBusy) return;
    const slots = roomSlots[curatingUid] || [];
    const current = assignments[curatingUid] || {};
    const empty = slots.filter((s) => !current[s.id]);
    if (!empty.length) return;
    setAutoBusy(true);
    try {
      // Gather a pool of candidate works, randomizing the starting page so the
      // result varies between runs.
      const pool: NftView[] = [];
      const seen = new Set<number>();
      const startPage = 1 + Math.floor(Math.random() * 20);
      for (let i = 0; i < 8 && pool.length < empty.length * 2; i++) {
        const page = startPage + i;
        const res = await fetch(`/api/museum/artworks?page=${page}`);
        if (!res.ok) break;
        const data = (await res.json()) as { artworks: NftView[] };
        if (!data.artworks?.length) break;
        for (const a of data.artworks) {
          if (!seen.has(a.id) && !a.isVideo) {
            seen.add(a.id);
            pool.push(a);
          }
        }
      }
      if (!pool.length) return;
      // Shuffle the pool, then assign one per empty slot (cycling if short).
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const next: Assignments = { ...current };
      empty.forEach((s, i) => {
        next[s.id] = pool[i % pool.length];
      });
      setAssignments((prev) => ({ ...prev, [curatingUid]: next }));
    } finally {
      setAutoBusy(false);
    }
  };

  // Keyboard shortcuts: R rotate, Del/Backspace remove, F focus, Esc cancel, H help.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "KeyR") {
        if (placing) setGhost((g) => ({ ...g, rotY: g.rotY + Math.PI / 4 }));
        else if (selected)
          setPlaced((p) => p.map((it) => (it.uid === selected ? { ...it, rotationY: it.rotationY + Math.PI / 4 } : it)));
      } else if (e.code === "Delete" || e.code === "Backspace") {
        // In curate mode, Del clears the hung artwork on the active slot.
        if (curatingUid && activeSlotId) {
          clearSlot(curatingUid, activeSlotId);
          setActiveSlotId(null);
        } else if (selected) {
          setPlaced((p) => p.filter((x) => x.uid !== selected));
          setAssignments((a) => {
            const next = { ...a };
            delete next[selected];
            return next;
          });
          if (curatingUid === selected) setCuratingUid(null);
          setSelected(null);
        }
      } else if (e.code === "KeyF") {
        const it = placed.find((x) => x.uid === selected);
        if (it && camApi.current) camApi.current.focus(new THREE.Vector3(...it.position));
      } else if (e.code === "Escape") {
        if (curatingUid) {
          setCuratingUid(null);
          setActiveSlotId(null);
        } else {
          setPlacing(null);
          setSelected(null);
        }
      } else if (e.code === "Home") {
        camApi.current?.reset();
      } else if (e.code === "KeyH") {
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, selected, placed, curatingUid, activeSlotId]);

  const placeAt = (x: number, z: number) => {
    if (!placing) return;
    const uid = `p${counter.current++}`;
    setPlaced((p) => [...p, { uid, room: placing, position: [snap(x), 0, snap(z)], rotationY: ghost.rotY }]);
    setSelected(uid);
    // stay in placement mode for rapid building (Esc / right-click to stop)
  };

  return (
    <div className="relative h-full w-full" style={{ background: "#070707" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [32, 30, 32], fov: 42 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        onPointerMissed={(e) => {
          if ((e as MouseEvent).button === 0) setSelected(null);
        }}
      >
        <color attach="background" args={["#070707"]} />
        <fog attach="fog" args={["#070707", 70, 200]} />
        <hemisphereLight intensity={0.45} groundColor="#050505" />
        <directionalLight
          position={[30, 40, 15]}
          intensity={1.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-80}
          shadow-camera-right={80}
          shadow-camera-top={80}
          shadow-camera-bottom={-80}
        />

        <Grid
          args={[600, 600]}
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
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
          onPointerMove={(e) => {
            if (placing) setGhost((g) => ({ ...g, pos: [e.point.x, 0, e.point.z] }));
            else if (draggingRef.current) {
              const id = draggingRef.current;
              setPlaced((p) => p.map((it) => (it.uid === id ? { ...it, position: [snap(e.point.x), 0, snap(e.point.z)] } : it)));
            }
          }}
          onPointerUp={() => (draggingRef.current = null)}
          onClick={(e) => {
            if (placing) {
              e.stopPropagation();
              placeAt(e.point.x, e.point.z);
            }
          }}
        >
          <planeGeometry args={[2000, 2000]} />
          <meshStandardMaterial color="#0b0b0b" roughness={1} />
        </mesh>

        {placing && <Ghost pos={ghost.pos} rotY={ghost.rotY} />}

        <Suspense fallback={null}>
          {placed.map((p) => (
            <Suspense
              key={p.uid}
              fallback={
                <Html position={p.position} center>
                  <span className="rounded bg-black/60 px-2 py-1 text-[10px] text-white/70">loading…</span>
                </Html>
              }
            >
              <PlacedRoom
                placed={p}
                selected={selected === p.uid}
                curating={curatingUid === p.uid}
                assignments={assignments[p.uid] || {}}
                activeSlotId={curatingUid === p.uid ? activeSlotId : null}
                onSelect={() => setSelected(p.uid)}
                onStartDrag={() => (draggingRef.current = p.uid)}
                onSlotClick={(slot) => selectSlot(slot.id)}
                onSlotsReady={(uid, slots) =>
                  setRoomSlots((prev) =>
                    prev[uid] === slots ? prev : { ...prev, [uid]: slots }
                  )
                }
              />
            </Suspense>
          ))}
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={1.8} position={[0, 12, -6]} scale={[24, 10, 1]} color="#ffffff" />
            <Lightformer intensity={1} position={[-12, 6, 6]} scale={[12, 12, 1]} color="#bcd0ff" />
          </Environment>
        </Suspense>

        <RTSControls apiRef={camApi} />
        <AdaptiveDpr pixelated />
      </Canvas>

      {/* Artwork picker (curate mode) */}
      {curatingUid && (
        <ArtworkPicker
          activeSlotLabel={activeSlotLabel}
          onPick={assignArt}
          onClose={() => {
            setCuratingUid(null);
            setActiveSlotId(null);
          }}
        />
      )}

      {/* Slot navigator — numbered list, click to fly to a slot */}
      {curatingUid && curatingSlots.length > 0 && (
        <div
          className="pointer-events-auto absolute bottom-0 top-0 z-30 flex w-14 flex-col border-r"
          style={{
            left: 360,
            background: "oklch(0.1 0 0 / 0.94)",
            borderColor: "var(--border)",
            backdropFilter: "blur(20px)",
          }}
        >
          <div
            className="border-b py-2 text-center text-[9px] uppercase tracking-[0.1em]"
            style={{ borderColor: "var(--border)", color: "var(--fg3)" }}
          >
            Slots
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-1.5">
            {curatingSlots.map((s) => {
              const filled = !!(assignments[curatingUid] || {})[s.id];
              const active = activeSlotId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => selectSlot(s.id)}
                  className="relative flex h-9 w-full items-center justify-center rounded-[var(--radius-sm)] border text-[11px] transition-transform hover:-translate-y-0.5"
                  style={{
                    fontFamily: "var(--font-mono)",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    background: active ? "var(--accent)" : filled ? "var(--muted)" : "transparent",
                    color: active ? "var(--accent-fg)" : "var(--fg1)",
                  }}
                  title={`Fly to slot ${s.index}${filled ? " (filled)" : ""}`}
                >
                  {s.index}
                  {filled && !active && (
                    <span
                      className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode banner */}
      {placing && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          <div
            className="rounded-full px-4 py-1.5 text-xs"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Placing “{placing.title}” · click to drop · R to rotate · Esc to stop
          </div>
        </div>
      )}

      {/* Curate banner */}
      {curatingRoom && (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          <div
            className="rounded-full px-4 py-1.5 text-xs"
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Curating “{curatingRoom.room.title}” ·{" "}
            {activeSlotId ? "pick a work from the panel" : "click a glowing slot"} · Esc to finish
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full border px-1.5 py-1 text-xs"
          style={{ background: "oklch(0.14 0 0 / 0.82)", borderColor: "var(--border)", backdropFilter: "blur(12px)" }}
        >
          <Btn onClick={() => camApi.current?.reset()}>Reset view</Btn>
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
          {curatingUid ? (
            <>
              <Btn onClick={autoPopulate} disabled={autoBusy}>
                {autoBusy ? "Filling…" : "Auto-populate"}
              </Btn>
              <Btn
                active
                onClick={() => {
                  setCuratingUid(null);
                  setActiveSlotId(null);
                }}
              >
                Done curating
              </Btn>
            </>
          ) : (
            <Btn onClick={() => selected && enterCurate(selected)} disabled={!selected}>
              Curate{" "}
              {selected && roomSlots[selected]
                ? `(${Object.keys(assignments[selected] || {}).length}/${roomSlots[selected].length})`
                : ""}
            </Btn>
          )}
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
          <Btn onClick={() => { setSelected(null); }} disabled={!selected}>Deselect</Btn>
          <Btn
            onClick={() => {
              if (selected) {
                setPlaced((p) => p.filter((x) => x.uid !== selected));
                setSelected(null);
              }
            }}
            disabled={!selected}
          >
            Remove
          </Btn>
          <Btn onClick={() => { setPlaced([]); setSelected(null); }} disabled={!placed.length}>Clear</Btn>
          <span className="mx-1 h-4 w-px" style={{ background: "var(--border)" }} />
          <Btn onClick={() => setShowHelp((v) => !v)} active={showHelp}>Controls</Btn>
        </div>
      </div>

      {/* Controls legend (gamer-friendly) */}
      {showHelp && (
        <div
          className="absolute bottom-3 left-3 z-10 w-60 rounded-[var(--radius-lg)] border p-3 text-[11px]"
          style={{ background: "oklch(0.12 0 0 / 0.9)", borderColor: "var(--border)", color: "var(--fg2)", backdropFilter: "blur(16px)" }}
        >
          <div className="mb-2 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--fg3)" }}>Controls</div>
          {[
            ["W A S D / Arrows", "Pan"],
            ["Q / E", "Rotate camera"],
            ["Right-drag", "Orbit"],
            ["Middle-drag", "Pan"],
            ["Scroll", "Zoom"],
            ["Screen edges", "Edge-scroll"],
            ["Shift", "Move faster"],
            ["Click tray → click", "Place room"],
            ["Drag room", "Move"],
            ["Select → Curate", "Hang artworks"],
            ["Click slot → pick", "Fill slot"],
            ["R", "Rotate piece / ghost"],
            ["F", "Focus selected"],
            ["Del", "Remove selected / slot"],
            ["Home", "Reset view"],
            ["Esc", "Cancel / deselect"],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-0.5">
              <kbd
                className="rounded px-1.5 py-0.5"
                style={{ background: "var(--muted)", color: "var(--fg1)", fontFamily: "var(--font-mono)" }}
              >
                {k}
              </kbd>
              <span className="ml-2 text-right">{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* Room tray / hotbar */}
      <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2">
        <div
          className="max-h-[68vh] w-56 overflow-y-auto rounded-[var(--radius-lg)] border p-2"
          style={{ background: "oklch(0.13 0 0 / 0.92)", borderColor: "var(--border)", backdropFilter: "blur(16px)" }}
        >
          <div className="mb-2 px-1 text-[10px] uppercase tracking-[0.1em]" style={{ color: "var(--fg3)" }}>
            Rooms · {placeable.length}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {placeable.map((r) => (
              <button
                key={r.id}
                onClick={() => { setPlacing(r); setSelected(null); }}
                className="group overflow-hidden rounded-[var(--radius)] border text-left transition-transform hover:-translate-y-0.5"
                style={{
                  borderColor: placing?.id === r.id ? "var(--accent)" : "var(--border)",
                  background: "var(--card)",
                }}
                title={`Place ${r.title}`}
              >
                <div className="aspect-square overflow-hidden" style={{ background: "var(--muted)" }}>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt={r.title} loading="lazy" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="truncate px-1.5 py-1 text-[10px]" style={{ color: "var(--fg2)" }}>{r.title}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  active,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-full px-3 py-1 transition-colors disabled:opacity-30"
      style={{ background: active ? "var(--accent)" : "transparent", color: active ? "var(--accent-fg)" : "var(--fg1)" }}
    >
      {children}
    </button>
  );
}
