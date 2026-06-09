"use client";

import { useEffect, useRef, useState } from "react";

// Lazily load Google's <model-viewer> web component from CDN once, then render
// the element. Used for 3D NFTs and immersive exhibition rooms (GLB/GLTF/OBJ).

const MODEL_VIEWER_SRC =
  "https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js";

let loaderPromise: Promise<void> | null = null;

function loadModelViewer(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (customElements.get("model-viewer")) return Promise.resolve();
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.type = "module";
    s.src = MODEL_VIEWER_SRC;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load model-viewer"));
    document.head.appendChild(s);
  });
  return loaderPromise;
}

interface Props {
  src: string;
  poster?: string;
  alt?: string;
  autoRotate?: boolean;
  cameraControls?: boolean;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export default function ModelViewer({
  src,
  poster,
  alt = "3D model",
  autoRotate = true,
  cameraControls = true,
  className,
  onLoad,
  onError,
}: Props) {
  const ref = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    loadModelViewer()
      .then(() => active && setReady(true))
      .catch(() => {
        if (active) {
          setFailed(true);
          onError?.();
        }
      });
    return () => {
      active = false;
    };
  }, [onError]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !ready) return;
    const handleLoad = () => onLoad?.();
    const handleErr = () => {
      setFailed(true);
      onError?.();
    };
    el.addEventListener("load", handleLoad);
    el.addEventListener("error", handleErr);
    return () => {
      el.removeEventListener("load", handleLoad);
      el.removeEventListener("error", handleErr);
    };
  }, [ready, onLoad, onError]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center text-sm ${className ?? ""}`}
        style={{ color: "var(--fg3)", background: "var(--muted)" }}
      >
        Unable to load 3D model
      </div>
    );
  }

  if (!ready) {
    return (
      <div
        className={`flex items-center justify-center ${className ?? ""}`}
        style={{ background: "var(--muted)" }}
      >
        <span className="animate-pulse text-xs" style={{ color: "var(--fg3)" }}>
          Loading 3D…
        </span>
      </div>
    );
  }

  // React 19 renders unknown custom elements and passes through attributes.
  // Typed as `any` so the kebab-case web-component attributes pass through
  // without colliding with R3F's JSX intrinsic augmentation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Tag = "model-viewer" as any;
  return (
    <Tag
      ref={ref}
      src={src}
      poster={poster}
      alt={alt}
      camera-controls={cameraControls ? "" : undefined}
      auto-rotate={autoRotate ? "" : undefined}
      rotation-per-second="30deg"
      auto-rotate-delay="2000"
      interaction-prompt="none"
      shadow-intensity="1"
      exposure="1"
      environment-image="neutral"
      className={className}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    />
  );
}
