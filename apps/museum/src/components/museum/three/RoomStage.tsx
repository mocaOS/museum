"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Lightformer,
  useGLTF,
  useProgress,
  BakeShadows,
  MeshReflectorMaterial,
  ContactShadows,
  Sparkles,
  PerformanceMonitor,
} from "@react-three/drei";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { VignetteShader } from "three/examples/jsm/shaders/VignetteShader.js";

/**
 * RoomStage — the ultra-HQ single-room viewer behind /rooms/[id].
 *
 * In contrast to the world builder (many rooms, draw-call budget first), this
 * stage spends its whole budget on one model: a blurred reflective floor,
 * radius-scaled soft shadows, a richer studio environment, MSAA + bloom +
 * vignette post, and a cinematic dolly-in. Everything is derived from the
 * model's bounding sphere so a 2m room and a 200m room read identically.
 */

// Fraction of the viewport the model's bounding sphere should cover once the
// intro dolly settles.
const FILL = 0.78;
// Slightly elevated 3/4 viewing angle (normalised before use).
const VIEW_DIR = new THREE.Vector3(1, 0.55, 1.1).normalize();
// Emissive handling — same rationale as the world builder: lift weak "Neon"
// emissives so their hue dominates the lit base, then scale the result down
// so authored ×10 rooms don't blow out. See Room history in git for detail.
const EMISSIVE_FLOOR = 3;
const EMISSIVE_SCALE = 0.4;
// The camera starts pulled back by this factor and eases to the framed
// distance — a slow dolly-in under the poster crossfade.
const INTRO_PULL = 1.16;
const INTRO_DAMP = 1.4;

interface SceneMetrics {
  radius: number;
  /** Lowest point of the recentered model — where the floor plane sits. */
  minY: number;
}

interface FrameTarget {
  distance: number;
  settled: boolean;
}

/** Preload a room GLB (draco + meshopt) — used for adjacent-room prefetch. */
export function preloadRoomModel(url: string) {
  try {
    useGLTF.preload(url, true, true);
  } catch {
    // Best-effort warmup; the real load handles its own errors.
  }
}

function Model({
  url,
  onMeasure,
}: {
  url: string;
  onMeasure: (metrics: SceneMetrics) => void;
}) {
  // Draco + Meshopt decoders enabled for the heavy room GLBs (2.6–20MB).
  const { scene } = useGLTF(url, true, true);

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // The detail stage renders real shadows (the lightbox never did) — every
      // mesh both casts onto and receives from the rest of the room.
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const m = mat as THREE.MeshStandardMaterial;
        if (m?.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) {
          // Read from a cached original so this stays idempotent across the
          // GLTF cache reusing materials between rooms (scale must not compound).
          const base = (m.userData.baseEmissive ??= m.emissiveIntensity ?? 1);
          m.emissiveIntensity = Math.max(base, EMISSIVE_FLOOR) * EMISSIVE_SCALE;
        }
      }
    });

    // Recenter on the world origin and report size + floor height so camera,
    // fog, lights and the reflector can all be framed scale-independently.
    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    scene.position.sub(center);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    onMeasure({
      radius: sphere.radius || 1,
      minY: box.min.y - center.y,
    });
  }, [scene, onMeasure]);

  return <primitive object={scene} />;
}

/**
 * Positions the camera so the sphere fills ~FILL of the viewport, starting
 * pulled back by INTRO_PULL (IntroDolly eases it in), and derives fog from the
 * same radius so only the deep background fades, never the model itself.
 */
function AutoFrame({
  radius,
  target,
  onFramed,
}: {
  radius: number;
  target: React.MutableRefObject<FrameTarget | null>;
  onFramed: () => void;
}) {
  const { camera, controls, scene, size } = useThree();

  useEffect(() => {
    if (!radius) return;
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    const vFov = (cam.fov * Math.PI) / 180;

    const fitHeight = radius / Math.tan(vFov / 2);
    const fitWidth = fitHeight / aspect;
    const distance = Math.max(fitHeight, fitWidth) / FILL;

    cam.position.copy(VIEW_DIR.clone().multiplyScalar(distance * INTRO_PULL));
    cam.near = Math.max(distance / 200, 0.01);
    cam.far = distance * 8 + radius * 12;
    cam.updateProjectionMatrix();

    // Haze starts just past the model's center and trails far out — the body
    // stays saturated, the reflector edge and background melt into it.
    scene.fog = new THREE.Fog(
      "#0a0a0a",
      distance + radius * 0.5,
      distance + radius * 6,
    );

    target.current = { distance, settled: false };

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

    // Reveal only after the framed camera has painted — the user never sees
    // the default zoom snapping into place.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(onFramed);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [radius, camera, controls, scene, size.width, size.height, target, onFramed]);

  return null;
}

/**
 * Eases the camera from the pulled-back intro position to the framed distance.
 * Controls are held disabled during the glide so damping doesn't fight the
 * dolly — but any gesture on the canvas (pointer down, wheel) interrupts the
 * cinematic and hands control over immediately. The listeners run in the
 * capture phase so OrbitControls is already re-enabled when the same event
 * reaches its own handlers, meaning the interrupting gesture itself orbits.
 */
function IntroDolly({
  target,
}: {
  target: React.MutableRefObject<FrameTarget | null>;
}) {
  const { camera, controls, gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    const interrupt = () => {
      const t = target.current;
      if (!t || t.settled) return;
      t.settled = true;
      const ctl = controls as unknown as { enabled: boolean; update: () => void } | null;
      if (ctl) {
        ctl.enabled = true;
        ctl.update();
      }
    };
    el.addEventListener("pointerdown", interrupt, true);
    el.addEventListener("wheel", interrupt, true);
    return () => {
      el.removeEventListener("pointerdown", interrupt, true);
      el.removeEventListener("wheel", interrupt, true);
    };
  }, [gl, controls, target]);

  useFrame((_, dt) => {
    const t = target.current;
    if (!t || t.settled) return;
    const ctl = controls as unknown as { enabled: boolean; update: () => void } | null;
    if (ctl) ctl.enabled = false;
    const next = THREE.MathUtils.damp(
      camera.position.length(),
      t.distance,
      INTRO_DAMP,
      Math.min(dt, 0.05),
    );
    camera.position.setLength(next);
    if (Math.abs(next - t.distance) < t.distance * 0.002) {
      camera.position.setLength(t.distance);
      t.settled = true;
      if (ctl) {
        ctl.enabled = true;
        ctl.update();
      }
    }
  });

  return null;
}

/**
 * Key light with a shadow camera sized to the model — without this, the
 * default ~10-unit ortho frustum clips shadows on anything bigger than a shed.
 */
function KeyLight({ radius }: { radius: number }) {
  const ref = useRef<THREE.DirectionalLight>(null);

  useLayoutEffect(() => {
    const light = ref.current;
    if (!light || !radius) return;
    light.position.set(radius * 1.4, radius * 2, radius * 1.1);
    const cam = light.shadow.camera;
    cam.left = -radius * 1.8;
    cam.right = radius * 1.8;
    cam.top = radius * 1.8;
    cam.bottom = -radius * 1.8;
    cam.near = radius * 0.2;
    cam.far = radius * 8;
    cam.updateProjectionMatrix();
    light.shadow.bias = -0.0001;
    // Normal bias scales with the scene, or acne returns on big rooms.
    light.shadow.normalBias = radius * 0.004;
  }, [radius]);

  return (
    <directionalLight
      ref={ref}
      castShadow
      intensity={1.5}
      color="#fff2e0"
      shadow-mapSize={[2048, 2048]}
    />
  );
}

/**
 * The "stage" itself: a blurred mirror floor at the model's base plus a baked
 * contact-shadow ring. The reflector renders the scene a second time, so it
 * only mounts once the model is measured; the contact shadows bake a single
 * frame. Both fade into the scene fog at the edges.
 */
function StageFloor({ metrics }: { metrics: SceneMetrics }) {
  const { radius, minY } = metrics;
  return (
    <group position={[0, minY, 0]}>
      {/* Slightly below the room's own floor so coplanar geometry never fights. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -radius * 0.004, 0]}>
        <circleGeometry args={[radius * 5, 80]} />
        <MeshReflectorMaterial
          blur={[350, 90]}
          resolution={1024}
          mixBlur={0.9}
          mixStrength={5}
          mirror={0.45}
          roughness={0.85}
          metalness={0.4}
          color="#070707"
        />
      </mesh>
      <ContactShadows
        frames={1}
        position={[0, -radius * 0.002, 0]}
        scale={radius * 4}
        far={radius * 1.4}
        blur={2.4}
        opacity={0.55}
        resolution={1024}
      />
    </group>
  );
}

/**
 * MSAA-resolved HDR post chain: RenderPass → UnrealBloom (neon only, threshold
 * 1.0) → OutputPass (tone mapping + sRGB) → subtle vignette in display space.
 * Canvas antialias is off — the 4× multisampled HalfFloat target does the AA.
 */
function PostFX() {
  const { gl, scene, camera, size } = useThree();

  const composer = useMemo(() => {
    const renderTarget = new THREE.WebGLRenderTarget(size.width, size.height, {
      samples: 4,
      type: THREE.HalfFloatType,
    });
    const c = new EffectComposer(gl, renderTarget);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(
      new UnrealBloomPass(
        new THREE.Vector2(size.width, size.height),
        0.5, // strength
        0.4, // radius
        // Luminance threshold in linear HDR: environment-lit surfaces stay
        // crisp; only the lifted emissive neon blooms.
        1.0,
      ),
    );
    c.addPass(new OutputPass());
    const vignette = new ShaderPass(VignetteShader);
    vignette.uniforms.offset.value = 0.92;
    vignette.uniforms.darkness.value = 1.08;
    c.addPass(vignette);
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

/** Bridges drei's global load progress out to the host (poster overlay). */
function ProgressBridge({ onProgress }: { onProgress?: (pct: number) => void }) {
  const { progress } = useProgress();
  useEffect(() => {
    onProgress?.(progress);
  }, [progress, onProgress]);
  return null;
}

export default function RoomStage({
  url,
  className,
  onProgress,
  onReady,
}: {
  url: string;
  className?: string;
  /** GLB download/decode progress, 0–100. */
  onProgress?: (pct: number) => void;
  /** Fired once the framed camera has painted — safe to fade the poster. */
  onReady?: () => void;
}) {
  const [metrics, setMetrics] = useState<SceneMetrics | null>(null);
  // Adaptive quality: drop render resolution when the GPU can't keep up
  // (reflector + bloom on a 20MB GLB is a lot for integrated graphics).
  const [dpr, setDpr] = useState<number | [number, number]>([1, 2]);
  const frameTarget = useRef<FrameTarget | null>(null);

  // Reset measurement when the model changes so a stale frame from the
  // previous room never leaks into the next one.
  useEffect(() => {
    setMetrics(null);
    frameTarget.current = null;
  }, [url]);

  const handleMeasure = useCallback((m: SceneMetrics) => setMetrics(m), []);
  const handleFramed = useCallback(() => onReady?.(), [onReady]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
      style={{ background: "#0a0a0a" }}
    >
      <ProgressBridge onProgress={onProgress} />
      <Canvas
        shadows
        dpr={dpr}
        camera={{ position: [6, 3.5, 7], fov: 42 }}
        gl={{
          antialias: false,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.12,
        }}
      >
        <color attach="background" args={["#0a0a0a"]} />

        <PerformanceMonitor
          onDecline={() => setDpr(1.25)}
          onIncline={() => setDpr([1, 2])}
          onFallback={() => setDpr(1)}
        />

        <hemisphereLight intensity={0.3} groundColor="#0a0a0a" />
        <directionalLight position={[-6, 4, -4]} intensity={0.35} color="#9bbcff" />
        <directionalLight position={[0, 3, -8]} intensity={0.5} color="#ffd9a0" />
        {metrics && <KeyLight radius={metrics.radius} />}

        <Suspense fallback={null}>
          <Model url={url} onMeasure={handleMeasure} />
          {metrics && (
            <>
              <AutoFrame
                radius={metrics.radius}
                target={frameTarget}
                onFramed={handleFramed}
              />
              <StageFloor metrics={metrics} />
              {/* Faint drifting dust — depth cue, sized to the room. */}
              <Sparkles
                count={60}
                position={[0, metrics.radius * 0.4, 0]}
                scale={[metrics.radius * 2.4, metrics.radius * 1.4, metrics.radius * 2.4]}
                size={1.6}
                speed={0.18}
                opacity={0.3}
                color="#bcd0ff"
              />
              {/* Mounted post-measure so the one-shot bake sees the final,
                  radius-scaled shadow camera. */}
              <BakeShadows />
            </>
          )}

          {/* In-scene studio environment — reflections without any CDN fetch.
              Higher res than the lightbox had; it feeds the mirror floor too. */}
          <Environment resolution={512} frames={1}>
            <Lightformer
              intensity={2.2}
              position={[0, 6, -3]}
              scale={[12, 6, 1]}
              color="#ffffff"
            />
            <Lightformer
              form="ring"
              intensity={1.4}
              position={[0, 9, 0]}
              rotation-x={-Math.PI / 2}
              scale={[8, 8, 1]}
              color="#ffffff"
            />
            <Lightformer
              intensity={1.2}
              position={[-6, 2.5, 3]}
              scale={[5, 5, 1]}
              color="#bcd0ff"
            />
            <Lightformer
              intensity={1}
              position={[6, 1.5, 3]}
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
          autoRotateSpeed={0.4}
          minDistance={0.5}
          maxDistance={200}
          // Keep the orbit above the mirror floor — from underneath the
          // single-sided reflector vanishes and the illusion breaks.
          maxPolarAngle={Math.PI * 0.55}
          enablePan
          mouseButtons={{
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.PAN,
            RIGHT: THREE.MOUSE.PAN,
          }}
        />
        <IntroDolly target={frameTarget} />
        <PostFX />
      </Canvas>
    </div>
  );
}
