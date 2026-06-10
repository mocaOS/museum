"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import type { RoomSlot } from "./slots";
import { fitToFrame } from "./slots";
import { artworkTextureUrl, type NftView } from "@/lib/museum/media";

export interface SlotAssignment {
  slotId: string;
  art: NftView;
}

const FRAME_DEPTH = 0.06;
const FRAME_BORDER = 0.08;

/**
 * One artwork hung on a wall slot. Positioned/oriented from the slot's
 * transform, sized to the work's true aspect ratio within the slot frame
 * (portrait → tall, landscape → wide), with a thin matte frame and a small
 * forward offset so it sits just proud of the wall (no z-fighting).
 */
export default function ArtworkPlane({
  slot,
  position,
  quaternion,
  art,
  selected,
  onSelect,
}: {
  slot: RoomSlot;
  /** World/local placement (overrides the slot's authored transform). */
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  art: NftView;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [failed, setFailed] = useState(false);

  const url = useMemo(() => artworkTextureUrl(art, 1024), [art]);

  useEffect(() => {
    let cancelled = false;
    setTexture(null);
    setFailed(false);
    if (!url) {
      setFailed(true);
      return;
    }
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
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => () => texture?.dispose(), [texture]);

  const { width, height } = useMemo(
    () => fitToFrame(art.ratio || 1, slot.width, slot.height),
    [art.ratio, slot.width, slot.height]
  );

  const fw = width + FRAME_BORDER;
  const fh = height + FRAME_BORDER;

  return (
    <group
      position={position}
      quaternion={quaternion}
      onPointerDown={(e) => {
        if (e.button !== 0 || !onSelect) return;
        e.stopPropagation();
        onSelect();
      }}
    >
      {/* Matte frame / backing, slightly proud of the wall along local +Z. */}
      <mesh position={[0, 0, 0.01]}>
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
          <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
        ) : (
          <meshBasicMaterial color={failed ? "#1a1a1a" : "#2a2a2a"} side={THREE.DoubleSide} />
        )}
      </mesh>
    </group>
  );
}
