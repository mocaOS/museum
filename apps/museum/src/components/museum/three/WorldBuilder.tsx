"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid, Environment, Lightformer, Html, useGLTF, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";

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
  reset: () => void;
}

// --- Custom RTS / city-builder camera ---------------------------------------
// Spring-arm rig: a ground `target` + yaw/pitch/distance. WASD/arrows pan,
// Q/E rotate, wheel zoom, RMB-drag orbit, MMB-drag pan, screen-edge scroll.
function RTSControls({ apiRef }: { apiRef: React.MutableRefObject<CameraApi | null> }) {
  const { camera, gl } = useThree();
  const s = useRef({
    target: new THREE.Vector3(0, 0, 0),
    yaw: Math.PI / 4,
    pitch: 0.9,
    dist: 46,
    keys: new Set<string>(),
    drag: null as null | "rotate" | "pan",
    last: { x: 0, y: 0 },
    edge: { x: 0, y: 0 },
  });

  useEffect(() => {
    apiRef.current = {
      focus: (p) => s.current.target.lerp(new THREE.Vector3(p.x, 0, p.z), 1),
      reset: () => {
        s.current.target.set(0, 0, 0);
        s.current.yaw = Math.PI / 4;
        s.current.pitch = 0.9;
        s.current.dist = 46;
      },
    };
  }, [apiRef]);

  useEffect(() => {
    const dom = gl.domElement;
    const onKeyDown = (e: KeyboardEvent) => s.current.keys.add(e.code);
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
          s.current.pitch = clamp(s.current.pitch - dy * 0.005, 0.2, 1.45);
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

function PlacedRoom({
  placed,
  selected,
  onSelect,
  onStartDrag,
}: {
  placed: Placed;
  selected: boolean;
  onSelect: () => void;
  onStartDrag: () => void;
}) {
  const { scene } = useGLTF(placed.room.modelUrl!, true, true);
  const cloned = useMemo(() => scene.clone(true), [scene]);
  const { scale, offset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(cloned);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const s = TILE / (Math.max(size.x, size.z) || 1);
    return { scale: s, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) };
  }, [cloned]);

  return (
    <group
      position={placed.position}
      rotation={[0, placed.rotationY, 0]}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
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
      <group scale={scale} position={[offset.x * scale, offset.y * scale, offset.z * scale]}>
        <primitive object={cloned} />
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
        if (selected) {
          setPlaced((p) => p.filter((x) => x.uid !== selected));
          setSelected(null);
        }
      } else if (e.code === "KeyF") {
        const it = placed.find((x) => x.uid === selected);
        if (it && camApi.current) camApi.current.focus(new THREE.Vector3(...it.position));
      } else if (e.code === "Escape") {
        setPlacing(null);
        setSelected(null);
      } else if (e.code === "Home") {
        camApi.current?.reset();
      } else if (e.code === "KeyH") {
        setShowHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placing, selected, placed]);

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
                onSelect={() => setSelected(p.uid)}
                onStartDrag={() => (draggingRef.current = p.uid)}
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

      {/* Action bar */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full border px-1.5 py-1 text-xs"
          style={{ background: "oklch(0.14 0 0 / 0.82)", borderColor: "var(--border)", backdropFilter: "blur(12px)" }}
        >
          <Btn onClick={() => camApi.current?.reset()}>Reset view</Btn>
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
            ["R", "Rotate piece / ghost"],
            ["F", "Focus selected"],
            ["Del", "Remove selected"],
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
