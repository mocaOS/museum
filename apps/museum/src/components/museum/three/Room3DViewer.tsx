"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  useGLTF,
  BakeShadows,
} from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Fraction of the viewport the model's bounding sphere should cover on load.
const FILL = 0.8;
// Slightly elevated 3/4 viewing angle (normalised before use).
const VIEW_DIR = new THREE.Vector3(1, 0.55, 1.1).normalize();
// Minimum emissive intensity for any self-lit ("Neon") material. Some rooms
// author their neon with a white, environment-lit base and emissive at the
// default strength of 1 (e.g. Feedback Loop) — under studio lighting that reads
// as plain white. Lifting weak emissives to this floor lets their hue dominate
// the lit base so the neon reads in colour; rooms that already bake in a strong
// emissive (e.g. The BLeU Room at ×10) keep their authored value.
const EMISSIVE_FLOOR = 3;
// Global dial on the final neon intensity — pulls the overall glow back so the
// brightest rooms don't blow out. Applied after the floor, so it scales both
// the authored (×10) and floored (×3) values uniformly.
const EMISSIVE_SCALE = 0.4;

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
    // Lift weak emissives to the floor so neon reads in colour rather than as
    // washed-out white (see EMISSIVE_FLOOR), then scale the result down. We read
    // from a cached original (userData.baseEmissive) rather than the live value
    // so this stays idempotent across re-runs and the GLTF cache reusing the
    // same materials between rooms — otherwise the scale would compound.
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m?.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) {
          const base = (m.userData.baseEmissive ??= m.emissiveIntensity ?? 1);
          m.emissiveIntensity = Math.max(base, EMISSIVE_FLOOR) * EMISSIVE_SCALE;
        }
      }
    });

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
function AutoFrame({
  radius,
  onFramed,
}: {
  radius: number;
  onFramed: () => void;
}) {
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

    // Scale-relative fog: a soft background haze for depth, pushed *behind* the
    // model so it never desaturates the body itself. Starting it at the model's
    // near face (distance - radius) washed dark, self-lit rooms (e.g. The BLeU
    // Room's neon) toward near-black; begin it just past center and trail it far
    // out so only the deep background fades, never the visible surfaces.
    scene.fog = new THREE.Fog(
      "#0a0a0a",
      distance + radius * 0.5,
      distance + radius * 6,
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

    // Reveal only after the framed camera has actually painted a frame, so the
    // user never sees the default/pre-framed zoom snapping into place.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(onFramed);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [radius, camera, controls, scene, size.width, size.height, onFramed]);

  return null;
}

/**
 * Adds an UnrealBloom pass so the rooms' emissive "Neon" materials bloom in
 * their own colour (paired with EMISSIVE_FLOOR, which makes sure the hue is
 * bright enough to bloom in the first place). Wires three's own EffectComposer
 * directly — no extra dependency: RenderPass → UnrealBloomPass → OutputPass,
 * where the OutputPass applies the canvas tone mapping so the framing/colour
 * match the plain pipeline. useFrame at priority 1 takes over R3F's render.
 */
function PostFX() {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        0.45, // strength
        0.4, // radius
        // Luminance threshold in linear HDR: high enough that environment-lit
        // surfaces (even white marble) stay crisp and only the emissive neon —
        // lifted to EMISSIVE_FLOOR or beyond — actually blooms.
        1.0,
      ),
    );
    c.addPass(new OutputPass());
    return c;
    // Size/dpr are synced in the effect below; only rebuild on a real swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size.width, size.height]);

  useEffect(() => () => composer.dispose(), [composer]);

  useFrame(() => {
    composer.render();
  }, 1);

  return null;
}

export default function Room3DViewer({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const [radius, setRadius] = useState(0);
  const [framed, setFramed] = useState(false);

  // Reset measurement + reveal state when the model changes so a stale frame
  // from the previous room never leaks into (or flashes before) the next one.
  useEffect(() => {
    setRadius(0);
    setFramed(false);
  }, [url]);
  const handleMeasure = useCallback((r: number) => setRadius(r), []);
  const handleFramed = useCallback(() => setFramed(true), []);

  return (
    <div
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

        <Suspense fallback={null}>
          {/* Model is recentered on the origin; AutoFrame measures it and
              positions the camera so it always covers ~80% of the viewport
              and derives fog from its size — independent of the GLB's scale. */}
          <Model url={url} onMeasure={handleMeasure} />
          <AutoFrame radius={radius} onFramed={handleFramed} />

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
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <BakeShadows />
        <PostFX />
      </Canvas>

      {/* Opaque cover over the canvas until the camera is framed — hides the
          GLB download and the initial zoom snap, then fades away. */}
      <div
        className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-500 ease-out"
        style={{ background: "#0a0a0a", opacity: framed ? 0 : 1 }}
      >
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs"
          style={{ background: "oklch(1 0 0 / 0.08)", color: "oklch(0.85 0 0)" }}
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Loading 3D…
        </div>
      </div>

      <div
        className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full px-3 py-1 text-[11px]"
        style={{ background: "oklch(0 0 0 / 0.45)", color: "oklch(0.8 0 0)" }}
      >
        Drag to orbit · scroll to zoom · right-drag to pan
      </div>
    </div>
  );
}
