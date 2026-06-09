"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  Html,
  useGLTF,
  AdaptiveDpr,
  BakeShadows,
} from "@react-three/drei";
import * as THREE from "three";

// Fraction of the viewport the model's bounding sphere should cover on load.
const FILL = 0.8;
// Slightly elevated 3/4 viewing angle (normalised before use).
const VIEW_DIR = new THREE.Vector3(1, 0.55, 1.1).normalize();

function Model({
  url,
  onMeasure,
}: {
  url: string;
  onMeasure: (radius: number) => void;
}) {
  // Draco + Meshopt decoders enabled for the heavy room GLBs (2.6–20MB).
  const { scene } = useGLTF(url, true, true);

  useLayoutEffect(() => {
    // Recenter the model on the world origin and report its size so the
    // camera + fog can be framed relative to it (scale-independent).
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    onMeasure(sphere.radius || 1);
  }, [scene, onMeasure]);

  return <primitive object={scene} />;
}

/**
 * Frames the camera so the model's bounding sphere fills ~`FILL` of the
 * viewport regardless of the GLB's native scale, and derives atmospheric fog
 * (near/far in camera-distance space) from the same radius so every room reads
 * with the same gentle depth haze whether it's 2m or 200m across.
 */
function AutoFrame({ radius }: { radius: number }) {
  const { camera, controls, scene, size } = useThree();

  useEffect(() => {
    if (!radius) return;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (cam.fov * Math.PI) / 180;

    // Distance at which the sphere fills the full frame, then back off so it
    // covers FILL of the limiting dimension (height or width on portrait).
    const fitHeight = radius / Math.tan(vFov / 2);
    const fitWidth = fitHeight / aspect;
    const distance = Math.max(fitHeight, fitWidth) / FILL;

    cam.position.copy(VIEW_DIR.clone().multiplyScalar(distance));
    cam.near = Math.max(distance / 200, 0.01);
    cam.far = distance * 6 + radius * 12;
    cam.updateProjectionMatrix();

    // Gentle, scale-relative fog: clear at the model's front face, hazing
    // toward the back and fully fogging the void beyond it.
    scene.fog = new THREE.Fog(
      "#0a0a0a",
      Math.max(distance - radius * 0.5, 0.01),
      distance + radius * 4,
    );

    const ctl = controls as unknown as {
      target: THREE.Vector3;
      minDistance: number;
      maxDistance: number;
      update: () => void;
    } | null;
    if (ctl) {
      ctl.target.set(0, 0, 0);
      ctl.minDistance = radius * 0.4;
      ctl.maxDistance = distance * 3;
      ctl.update();
    }
  }, [radius, camera, controls, scene, size.width, size.height]);

  return null;
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
  const [radius, setRadius] = useState(0);

  // Reset the measured size when the model changes so a stale frame from the
  // previous room never leaks into the next one.
  useEffect(() => setRadius(0), [url]);
  const handleMeasure = useCallback((r: number) => setRadius(r), []);

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
          {/* Model is recentered on the origin; AutoFrame measures it and
              positions the camera so it always covers ~80% of the viewport
              and derives fog from its size — independent of the GLB's scale. */}
          <Model url={url} onMeasure={handleMeasure} />
          <AutoFrame radius={radius} />

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
