"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  Bounds,
  Center,
  Html,
  useGLTF,
  AdaptiveDpr,
  BakeShadows,
} from "@react-three/drei";
import * as THREE from "three";

function Model({ url }: { url: string }) {
  // Draco + Meshopt decoders enabled for the heavy room GLBs (2.6–20MB).
  const { scene } = useGLTF(url, true, true);
  return <primitive object={scene} />;
}

function Loader() {
  return (
    <Html center>
      <div
        className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
        style={{ background: "oklch(1 0 0 / 0.08)", color: "oklch(0.85 0 0)" }}
      >
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        Loading 3D…
      </div>
    </Html>
  );
}

export default function Room3DViewer({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [isFs, setIsFs] = useState(false);

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) wrapRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <div
      ref={wrapRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
      style={{ background: "#0a0a0a" }}
    >
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [4, 2.5, 6], fov: 45 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.1,
        }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <fog attach="fog" args={["#0a0a0a", 30, 90]} />

        <hemisphereLight intensity={0.35} groundColor="#0a0a0a" />
        <directionalLight
          position={[6, 10, 6]}
          intensity={1.4}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0001}
        />
        <directionalLight position={[-6, 4, -4]} intensity={0.4} color="#9bbcff" />

        <Suspense fallback={<Loader />}>
          {/* Center the model at the origin; Bounds frames it with generous
              padding so it sits comfortably in the middle, zoomed out. */}
          <Bounds fit clip observe margin={1.8}>
            <Center>
              <Model url={url} />
            </Center>
          </Bounds>

          {/* In-scene studio environment — reflections without any CDN fetch. */}
          <Environment resolution={256} frames={1}>
            <Lightformer
              intensity={2}
              position={[0, 5, -2]}
              scale={[10, 5, 1]}
              color="#ffffff"
            />
            <Lightformer
              intensity={1.2}
              position={[-5, 2, 2]}
              scale={[5, 5, 1]}
              color="#bcd0ff"
            />
            <Lightformer
              intensity={1}
              position={[5, 1, 2]}
              scale={[5, 5, 1]}
              color="#ffd9a0"
            />
          </Environment>
        </Suspense>

        <OrbitControls
          makeDefault
          target={[0, 0, 0]}
          enableDamping
          dampingFactor={0.08}
          autoRotate
          autoRotateSpeed={0.5}
          minDistance={0.5}
          maxDistance={200}
          enablePan
        />
        <AdaptiveDpr pixelated />
        <BakeShadows />
      </Canvas>

      {/* Fullscreen toggle */}
      <button
        onClick={toggleFullscreen}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-[var(--radius)] transition-colors"
        style={{ background: "oklch(0 0 0 / 0.5)", color: "oklch(1 0 0)" }}
        aria-label={isFs ? "Exit fullscreen" : "Fullscreen"}
      >
        {isFs ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
          </svg>
        )}
      </button>

      <div
        className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full px-3 py-1 text-[11px]"
        style={{ background: "oklch(0 0 0 / 0.45)", color: "oklch(0.8 0 0)" }}
      >
        Drag to orbit · scroll to zoom · right-drag to pan
      </div>
    </div>
  );
}
