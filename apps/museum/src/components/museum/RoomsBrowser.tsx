"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";

// R3F viewer is heavy + WebGL-only — load it client-side, on demand.
const Room3DViewer = dynamic(() => import("./three/Room3DViewer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm" style={{ color: "oklch(0.7 0 0)" }}>
      Loading 3D viewer…
    </div>
  ),
});

export interface RoomView {
  id: number;
  title: string;
  architect?: string | null;
  description?: string | null;
  series?: string | null;
  modelUrl?: string;
  imageUrl?: string;
}

export default function RoomsBrowser({ rooms }: { rooms: RoomView[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (!rooms.length) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: "var(--fg2)" }}>
        No exhibitions are open right now. Check back soon.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room, i) => (
          <button
            key={room.id}
            onClick={() => setOpenIndex(i)}
            className="group overflow-hidden rounded-[var(--radius-xl)] border text-left transition-transform duration-200 hover:-translate-y-1"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="aspect-[4/3] overflow-hidden" style={{ background: "var(--muted)" }}>
              {room.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={room.imageUrl}
                  alt={room.title}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--fg3)" }}>
                  {room.title}
                </div>
              )}
            </div>
            <div className="p-5">
              {room.series && (
                <div
                  className="mb-1 text-[10.5px] uppercase tracking-[0.1em]"
                  style={{ color: "var(--fg3)" }}
                >
                  {room.series}
                </div>
              )}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium" style={{ color: "var(--fg1)" }}>
                  {room.title}
                </h2>
                {room.modelUrl && (
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                    style={{ background: "var(--muted)", color: "var(--fg2)" }}
                  >
                    3D
                  </span>
                )}
              </div>
              {room.architect && (
                <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
                  by {room.architect}
                </p>
              )}
            </div>
          </button>
        ))}
      </div>

      {openIndex !== null && (
        <RoomLightbox
          rooms={rooms}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </>
  );
}

function RoomLightbox({
  rooms,
  index,
  onClose,
  onNavigate,
}: {
  rooms: RoomView[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
}) {
  const room = rooms[index];
  const hasPrev = index > 0;
  const hasNext = index < rooms.length - 1;

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next >= 0 && next < rooms.length) onNavigate(next);
    },
    [index, rooms.length, onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [go, onClose]);

  if (!room) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col"
      style={{ background: "oklch(0 0 0 / 0.94)", backdropFilter: "blur(8px)" }}
    >
      <div className="flex items-center justify-between p-4">
        <div className="px-2">
          <div className="text-sm font-medium" style={{ color: "oklch(1 0 0)" }}>
            {room.title}
          </div>
          {room.architect && (
            <div className="text-xs" style={{ color: "oklch(0.7 0 0)" }}>
              by {room.architect}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full"
          style={{ color: "oklch(1 0 0)", background: "oklch(1 0 0 / 0.08)" }}
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {hasPrev && <Nav side="left" onClick={() => go(-1)} />}
        {room.modelUrl ? (
          // Truly fullscreen 3D — the viewer fills the whole stage, model centered.
          <Room3DViewer key={room.id} url={room.modelUrl} className="absolute inset-0" />
        ) : room.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={room.imageUrl} alt={room.title} className="mx-auto max-h-[82vh] max-w-5xl object-contain px-4" />
        ) : null}
        {hasNext && <Nav side="right" onClick={() => go(1)} />}
      </div>

      {room.description && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-2xl px-6 pb-6 text-center text-sm"
          style={{ color: "oklch(0.82 0 0)" }}
        >
          {room.description}
        </div>
      )}
    </div>
  );
}

function Nav({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full ${
        side === "left" ? "left-2 sm:left-6" : "right-2 sm:right-6"
      }`}
      style={{ color: "oklch(1 0 0)", background: "oklch(1 0 0 / 0.08)" }}
      aria-label={side === "left" ? "Previous" : "Next"}
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </button>
  );
}
