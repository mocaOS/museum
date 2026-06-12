"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";

// The HQ stage is heavy (r3f + drei + post chain) — load it client-side, on
// demand. The poster veil below covers the gap, so no loading placeholder here.
const RoomStage = dynamic(() => import("./three/RoomStage"), { ssr: false });

export interface RoomDetailView {
  id: number;
  title: string;
  architect?: string | null;
  description?: string | null;
  series?: string | null;
  slots?: number | null;
  modelUrl?: string;
  /** Direct-download URL for the HQ GLB (Directus `?download` variant). */
  downloadUrl?: string;
  /** Onchain owner (ROOMs ERC-721 on Ethereum), ENS-resolved when set. */
  owner?: { address: string; ens: string | null } | null;
  /** Large still of the room — the loading veil and the no-model fallback. */
  posterUrl?: string;
}

const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export interface RoomNeighbor {
  id: number;
  title: string;
  modelUrl?: string;
}

export default function RoomDetail({
  room,
  prev,
  next,
  index,
  total,
}: {
  room: RoomDetailView;
  prev?: RoomNeighbor | null;
  next?: RoomNeighbor | null;
  index: number;
  total: number;
}) {
  const router = useRouter();
  const [ready, setReady] = useState(!room.modelUrl);
  const [progress, setProgress] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Keyboard walk-through: arrows move between rooms, Escape returns to the grid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push("/rooms");
      if (e.key === "ArrowLeft" && prev) router.push(`/rooms/${prev.id}`);
      if (e.key === "ArrowRight" && next) router.push(`/rooms/${next.id}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, prev, next]);

  // Once this room is up, warm the neighbours' GLBs in idle time so the
  // arrow-key walk feels instant. The stage module is already loaded by then,
  // so the dynamic import resolves from cache.
  useEffect(() => {
    if (!ready) return;
    const urls = [next?.modelUrl, prev?.modelUrl].filter(
      (u): u is string => Boolean(u),
    );
    if (!urls.length) return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    };
    const schedule = w.requestIdleCallback
      ? (cb: () => void) => w.requestIdleCallback!(cb, { timeout: 4000 })
      : (cb: () => void) => window.setTimeout(cb, 1500);
    schedule(() => {
      import("./three/RoomStage").then((m) =>
        urls.forEach((u) => m.preloadRoomModel(u)),
      );
    });
  }, [ready, prev, next]);

  const handleReady = useCallback(() => setReady(true), []);

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "#0a0a0a" }}>
      {room.modelUrl ? (
        <RoomStage
          key={room.id}
          url={room.modelUrl}
          className="absolute inset-0"
          onProgress={setProgress}
          onReady={handleReady}
        />
      ) : room.posterUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={room.posterUrl}
          alt={room.title}
          className="absolute inset-0 h-full w-full object-contain p-4 sm:p-10"
        />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center text-sm"
          style={{ color: "var(--fg3)" }}
        >
          No preview available for this room yet.
        </div>
      )}

      {/* Poster veil — covers the GLB download + framing, then crossfades away. */}
      {room.modelUrl && (
        <div
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-700 ease-out"
          style={{ background: "#0a0a0a", opacity: ready ? 0 : 1 }}
        >
          {room.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={room.posterUrl}
              alt=""
              aria-hidden
              className="h-full w-full scale-105 object-cover opacity-35 blur-sm"
            />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div
              className="text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              Entering
            </div>
            <div
              className="px-6 text-center text-xl font-semibold sm:text-2xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
            >
              {room.title}
            </div>
            <div
              className="h-0.5 w-44 overflow-hidden rounded-full"
              style={{ background: "oklch(1 0 0 / 0.12)" }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${Math.round(progress)}%`, background: "var(--accent)" }}
              />
            </div>
            <div className="font-mono text-[11px]" style={{ color: "var(--fg3)" }}>
              {Math.round(progress)}%
            </div>
          </div>
        </div>
      )}

      {/* Top chrome: back to the grid (left), room counter + walk arrows (right). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between p-3 sm:p-4">
        <Link
          href="/rooms"
          className="pointer-events-auto flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs"
          style={{
            background: "oklch(0.14 0 0 / 0.8)",
            borderColor: "var(--border)",
            color: "var(--fg1)",
            backdropFilter: "blur(12px)",
          }}
        >
          ← Exhibitions
        </Link>
        <div className="pointer-events-auto flex items-center gap-2">
          <span
            className="hidden font-mono text-[11px] sm:block"
            style={{ color: "var(--fg3)" }}
          >
            {index + 1} / {total}
          </span>
          {prev && (
            <NeighborLink room={prev} side="left" />
          )}
          {next && (
            <NeighborLink room={next} side="right" />
          )}
        </div>
      </div>

      {/* Bottom chrome: glass info card (left), controls hint (right). */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex items-end justify-between gap-4 p-3 sm:p-5">
        <div
          className="pointer-events-auto max-w-md rounded-[var(--radius-xl)] border p-4 sm:p-5"
          style={{
            background: "oklch(0.14 0 0 / 0.72)",
            borderColor: "var(--border)",
            backdropFilter: "blur(24px)",
          }}
        >
          {room.series && (
            <div
              className="mb-1.5 text-[10.5px] uppercase tracking-[0.1em]"
              style={{ color: "var(--fg3)" }}
            >
              {room.series}
            </div>
          )}
          <h1
            className="text-xl font-semibold sm:text-2xl"
            style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
          >
            {room.title}
          </h1>
          {room.architect && (
            <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
              by {room.architect}
            </p>
          )}
          {room.owner && (
            <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
              owned by{" "}
              <a
                href={`https://etherscan.io/address/${room.owner.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:underline"
                style={{
                  color: "var(--fg1)",
                  fontFamily: room.owner.ens ? undefined : "var(--font-mono)",
                }}
                title={room.owner.address}
              >
                {room.owner.ens ?? shortAddress(room.owner.address)}
              </a>
            </p>
          )}
          {(room.modelUrl || (room.slots ?? 0) > 0 || room.downloadUrl) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {room.modelUrl && <Chip>3D</Chip>}
              {(room.slots ?? 0) > 0 && <Chip>{room.slots} wall slots</Chip>}
              {room.downloadUrl && (
                <a
                  href={room.downloadUrl}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors"
                  style={{ background: "oklch(1 0 0 / 0.08)", color: "var(--fg1)" }}
                  title="Download the room's GLB model"
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M12 15V3" />
                  </svg>
                  Download GLB
                </a>
              )}
            </div>
          )}
          {room.description && (
            <div className="mt-3">
              <p
                className={`text-sm leading-relaxed ${expanded ? "" : "line-clamp-3"}`}
                style={{ color: "var(--fg2)" }}
              >
                {room.description}
              </p>
              {room.description.length > 180 && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1.5 text-xs underline-offset-2 hover:underline"
                  style={{ color: "var(--fg3)" }}
                >
                  {expanded ? "Less" : "More"}
                </button>
              )}
            </div>
          )}
        </div>

        {room.modelUrl && (
          <div
            className="pointer-events-none hidden shrink-0 rounded-full px-3 py-1 text-[11px] sm:block"
            style={{ background: "oklch(0 0 0 / 0.45)", color: "oklch(0.8 0 0)" }}
          >
            Drag to orbit · scroll to zoom · right-drag to pan · ←/→ next room
          </div>
        )}
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
      style={{ background: "oklch(1 0 0 / 0.08)", color: "var(--fg2)" }}
    >
      {children}
    </span>
  );
}

function NeighborLink({ room, side }: { room: RoomNeighbor; side: "left" | "right" }) {
  return (
    <Link
      href={`/rooms/${room.id}`}
      aria-label={side === "left" ? `Previous room: ${room.title}` : `Next room: ${room.title}`}
      title={room.title}
      className="flex h-8 w-8 items-center justify-center rounded-full border"
      style={{
        background: "oklch(0.14 0 0 / 0.8)",
        borderColor: "var(--border)",
        color: "var(--fg1)",
        backdropFilter: "blur(12px)",
      }}
    >
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {side === "left" ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
      </svg>
    </Link>
  );
}
