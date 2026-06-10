"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { RoomSlot } from "./slots";
import { fitToFrame } from "./slots";
import { artworkTextureUrl, artworkVideoUrl, type NftView } from "@/lib/museum/media";
import type { SlotOverride } from "./world-storage";

const FRAME_DEPTH = 0.06;
const FRAME_BORDER = 0.08;
const MIN_SCALE = 0.35;
const MAX_SCALE = 3;

export const DEFAULT_OVERRIDE: SlotOverride = { dx: 0, dy: 0, scale: 1 };

function setCursor(cursor: string) {
  document.body.style.cursor = cursor;
}

/**
 * One artwork hung on a wall slot. Positioned/oriented from the slot's
 * transform, sized to the work's true aspect ratio (read from the loaded
 * texture's pixels, falling back to catalog metadata) within the slot frame,
 * with a thin matte frame and a small forward offset so it sits just proud of
 * the wall. While curating, the piece can be dragged along the wall plane and
 * resized via the corner handle; both write a per-slot override.
 */
export default function ArtworkPlane({
  slot,
  position,
  quaternion,
  art,
  selected,
  override,
  editable,
  onSelect,
  onOverrideChange,
}: {
  slot: RoomSlot;
  /** World/local placement (overrides the slot's authored transform). */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  art: NftView;
  selected?: boolean;
  /** Per-slot move/resize adjustment (room-local units / scale factor). */
  override?: SlotOverride;
  /** Curate mode: enables drag-to-move and the corner resize handle. */
  editable?: boolean;
  onSelect?: () => void;
  onOverrideChange?: (next: SlotOverride) => void;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const drag = useRef<null | {
    kind: "move" | "resize";
    grab: THREE.Vector3; // pointer offset from the piece center, local space
  }>(null);

  const url = useMemo(() => artworkTextureUrl(art, 1024), [art]);
  const videoUrl = useMemo(() => artworkVideoUrl(art, 1024), [art]);

  useEffect(() => {
    let cancelled = false;
    let video: HTMLVideoElement | null = null;
    setTexture(null);
    setFailed(false);

    if (url) {
      // Still image → same-origin texture proxy.
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin("anonymous");
      loader.load(
        url,
        (tex) => {
          if (cancelled) {
            tex.dispose();
            return;
          }
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          setTexture(tex);
        },
        undefined,
        () => {
          if (!cancelled) setFailed(true);
        }
      );
    } else if (videoUrl) {
      // Video-only work → live VideoTexture, muted + looped (gallery walls of
      // crypto art are full of motion pieces; a dark placeholder isn't art).
      video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "auto";
      video.src = videoUrl;
      const onReady = () => {
        if (cancelled || !video) return;
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        setTexture(tex);
        video.play().catch(() => {
          /* still shows the first frame */
        });
      };
      const onError = () => {
        if (!cancelled) setFailed(true);
      };
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.load();
    } else {
      setFailed(true);
    }

    return () => {
      cancelled = true;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [url, videoUrl]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const ov = override ?? DEFAULT_OVERRIDE;

  // The loaded media is the artwork — its pixel dimensions beat (often
  // missing or stale) catalog metadata for portrait/landscape sizing.
  const ratio = useMemo(() => {
    const img = texture?.image as
      | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
      | undefined;
    const w = img?.videoWidth || img?.width;
    const h = img?.videoHeight || img?.height;
    if (w && h) return w / h;
    return art.ratio || 1;
  }, [texture, art.ratio]);

  const base = useMemo(
    () => fitToFrame(ratio, slot.width, slot.height),
    [ratio, slot.width, slot.height]
  );
  const width = base.width * ov.scale;
  const height = base.height * ov.scale;

  const fw = width + FRAME_BORDER;
  const fh = height + FRAME_BORDER;

  // Project the pointer ray onto the wall plane and express it in this
  // group's local space (x right / y up along the wall). Robust during
  // pointer capture, when the ray no longer hits the artwork mesh itself.
  const localPoint = (e: ThreeEvent<PointerEvent>): THREE.Vector3 | null => {
    const g = groupRef.current;
    if (!g) return null;
    g.updateMatrixWorld();
    const origin = new THREE.Vector3().setFromMatrixPosition(g.matrixWorld);
    const normal = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(g.getWorldQuaternion(new THREE.Quaternion()))
      .normalize();
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, origin);
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane, hit)) return null;
    return g.worldToLocal(hit);
  };

  const beginDrag = (e: ThreeEvent<PointerEvent>, kind: "move" | "resize") => {
    if (!editable || !onOverrideChange) return;
    const p = localPoint(e);
    if (!p) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = {
      kind,
      grab: new THREE.Vector3(p.x - ov.dx, p.y - ov.dy, 0),
    };
    onSelect?.();
  };

  const moveDrag = (e: ThreeEvent<PointerEvent>) => {
    const d = drag.current;
    if (!d || !onOverrideChange) return;
    const p = localPoint(e);
    if (!p) return;
    e.stopPropagation();
    if (d.kind === "move") {
      // Keep the piece near its authored anchor — generous play, but it can't
      // wander to the far side of the room.
      const limX = Math.max(slot.width * 2, 2);
      const limY = Math.max(slot.height * 0.9, 1);
      onOverrideChange({
        ...ov,
        dx: THREE.MathUtils.clamp(p.x - d.grab.x, -limX, limX),
        dy: THREE.MathUtils.clamp(p.y - d.grab.y, -limY, limY),
      });
    } else {
      // Corner handle: uniform scale so the corner tracks the pointer.
      const lx = Math.abs(p.x - ov.dx);
      const ly = Math.abs(p.y - ov.dy);
      const scale = Math.max((2 * lx) / (base.width || 1), (2 * ly) / (base.height || 1));
      onOverrideChange({
        ...ov,
        scale: THREE.MathUtils.clamp(scale, MIN_SCALE, MAX_SCALE),
      });
    }
  };

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!drag.current) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    drag.current = null;
  };

  const handleSize = Math.max(0.12, Math.min(fw, fh) * 0.12);

  return (
    <group position={position} quaternion={quaternion} ref={groupRef}>
      <group position={[ov.dx, ov.dy, 0]}>
        {/* Matte frame / backing, slightly proud of the wall along local +Z. */}
        <mesh
          position={[0, 0, 0.01]}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if (editable && onOverrideChange) {
              beginDrag(e, "move");
            } else if (onSelect) {
              e.stopPropagation();
              onSelect();
            }
          }}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerOver={() => editable && setCursor("move")}
          onPointerOut={() => editable && setCursor("auto")}
        >
          <boxGeometry args={[fw, fh, FRAME_DEPTH]} />
          <meshStandardMaterial
            color={selected ? "#e0b24d" : "#0b0b0b"}
            roughness={0.7}
            metalness={0.05}
            emissive={selected ? "#e0b24d" : "#000000"}
            emissiveIntensity={selected ? 0.35 : 0}
          />
        </mesh>

        {/* The artwork itself. Unlit (meshBasicMaterial) so it displays at true
            colors regardless of how much room light reaches the wall, and
            double-sided so it's never a black backface if the slot's authored
            orientation is flipped. */}
        <mesh position={[0, 0, 0.01 + FRAME_DEPTH / 2 + 0.001]}>
          <planeGeometry args={[width, height]} />
          {texture ? (
            // Explicit white: basic material multiplies map × color, and when
            // this element reconciles from the placeholder branch r3f leaves
            // the previous (dark) color in place — which renders the texture
            // black. Never rely on the implicit color with a map.
            <meshBasicMaterial
              map={texture}
              color="#ffffff"
              toneMapped={false}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshBasicMaterial color={failed ? "#161616" : "#232323"} side={THREE.DoubleSide} />
          )}
        </mesh>

        {/* Corner resize handle (curate mode, selected piece only). */}
        {editable && selected && onOverrideChange && (
          <mesh
            position={[fw / 2, -fh / 2, 0.02 + FRAME_DEPTH]}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              beginDrag(e, "resize");
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerOver={() => setCursor("nwse-resize")}
            onPointerOut={() => setCursor(editable ? "move" : "auto")}
          >
            <circleGeometry args={[handleSize, 20]} />
            <meshBasicMaterial color="#e0b24d" side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}
