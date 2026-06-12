"use client";

import { type ReactNode, useEffect, useState } from "react";
import type { HyperfyExhibition } from "./hyperfy-export";
import {
  type SpawnProgress,
  type SpawnResult,
  spawnExhibition,
} from "@/lib/museum/hyperfy/spawn";

/**
 * "Spawn to Hyperfy" — sends the current exhibition into any self-hosted
 * Hyperfy v2 world, straight from the curator's browser (the world URL +
 * admin key are all it takes; nothing flows through MOCA servers).
 *
 * Re-spawning the same exhibition updates the rooms already in the world:
 * curation changes land, in-engine arrangement survives.
 */

const TARGET_KEY = "moca-hyperfy-target-v1";

interface StoredTarget {
  url: string;
  key: string;
}

function loadTarget(): StoredTarget {
  try {
    const raw = window.localStorage.getItem(TARGET_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<StoredTarget>;
      return { url: p.url || "", key: p.key || "" };
    }
  } catch {
    /* noop */
  }
  return { url: "", key: "" };
}

function saveTarget(target: StoredTarget) {
  try {
    window.localStorage.setItem(TARGET_KEY, JSON.stringify(target));
  } catch {
    /* noop */
  }
}

function Icon({ size = 15, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function IconClose({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>;
}
function IconCheck({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M20 6 9 17l-5-5" />
  </Icon>;
}
function IconAlert({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v4M12 16h.01" />
  </Icon>;
}
function IconExternal({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M15 3h6v6" />
    <path d="M10 14 21 3" />
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
  </Icon>;
}
function IconGlobe({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
  </Icon>;
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px]"
      style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
      aria-hidden
    />
  );
}

const STATUS_TEXT: Record<string, string> = {
  connecting: "Waiting",
  model: "Uploading room model…",
  artworks: "Uploading artworks…",
  script: "Uploading curation…",
  spawning: "Spawning…",
  created: "Spawned",
  updated: "Curation updated",
  unchanged: "Already up to date",
  failed: "Failed",
};

export default function SpawnHyperfyDialog({
  open,
  onClose,
  buildExhibition,
}: {
  open: boolean;
  onClose: () => void;
  buildExhibition: () => HyperfyExhibition;
}) {
  const [ url, setUrl ] = useState("");
  const [ key, setKey ] = useState("");
  const [ artSize, setArtSize ] = useState(2);
  const [ tileMeters, setTileMeters ] = useState(16);
  const [ relayout, setRelayout ] = useState(false);
  const [ phase, setPhase ] = useState<"form" | "spawning" | "done">("form");
  const [ progress, setProgress ] = useState<SpawnProgress | null>(null);
  const [ result, setResult ] = useState<SpawnResult | null>(null);
  const [ error, setError ] = useState<string | null>(null);

  // Re-arm the form (and recall the last target) every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const t = loadTarget();
    setUrl(t.url);
    setKey(t.key);
    setPhase("form");
    setProgress(null);
    setResult(null);
    setError(null);
  }, [ open ]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "spawning") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ open, phase, onClose ]);

  if (!open) return null;

  const normalizedUrl = url.trim().replace(/\/+$/, "");
  const urlOk = /^https?:\/\/.+/.test(normalizedUrl);
  // Browsers block ws:// and http:// requests from an https page.
  const mixedContent
    = urlOk
      && normalizedUrl.startsWith("http://")
      && typeof window !== "undefined"
      && window.location.protocol === "https:";

  const spawn = async () => {
    if (!urlOk || phase === "spawning") return;
    saveTarget({ url: normalizedUrl, key });
    setError(null);
    setPhase("spawning");
    try {
      const exhibition = buildExhibition();
      const res = await spawnExhibition(exhibition, {
        url: normalizedUrl,
        key: key.trim() || undefined,
        artSize,
        tileMeters,
        relayout,
        onProgress: setProgress,
      });
      setResult(res);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("form");
    }
  };

  const rooms = progress?.rooms ?? [];
  const busy = phase === "spawning";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 0.60)", backdropFilter: "blur(6px)" }}
      onClick={() => !busy && onClose()}
    >
      <div
        className={`
          flex w-full max-w-md flex-col rounded-[var(--radius-xl)] border
        `}
        style={{
          maxHeight: "calc(85dvh / var(--ui-scale, 1))",
          background: "var(--popover)",
          borderColor: "var(--border)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5" style={{ color: "var(--accent)" }}>
              <IconGlobe size={20} />
            </span>
            <div>
              <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
                Spawn to Hyperfy
              </div>
              <div className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "var(--fg3)" }}>
                Send this exhibition into a self-hosted world — straight from
                your browser.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className={`
              -m-1 rounded-full p-1 transition-colors
              disabled:opacity-30
            `}
            style={{ color: "var(--fg3)" }}
            title="Close"
          >
            <IconClose size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === "form" && (
            <div className="flex flex-col gap-3.5">
              <label className="block">
                <span
                  className="mb-1.5 block text-[10.5px] tracking-[0.08em] uppercase"
                  style={{ color: "var(--fg3)" }}
                >
                  World URL
                </span>
                <input
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://your-world.example.com"
                  autoFocus
                  className={`
                    h-9 w-full rounded-[var(--radius)] border bg-transparent
                    px-3 font-mono text-[13px] outline-none
                  `}
                  style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
                />
              </label>
              <label className="block">
                <span
                  className="mb-1.5 block text-[10.5px] tracking-[0.08em] uppercase"
                  style={{ color: "var(--fg3)" }}
                >
                  Admin key
                </span>
                <input
                  value={key}
                  onChange={e => setKey(e.target.value)}
                  placeholder="the world's ADMIN_CODE"
                  type="password"
                  autoComplete="off"
                  className={`
                    h-9 w-full rounded-[var(--radius)] border bg-transparent
                    px-3 font-mono text-[13px] outline-none
                  `}
                  style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
                />
                <span className="mt-1.5 block text-[11px]" style={{ color: "var(--fg3)" }}>
                  Both stay in this browser. The exhibition travels directly to
                  the world — never through museum servers.
                </span>
              </label>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                <label
                  className="flex items-center gap-2 text-[11px]"
                  style={{ color: "var(--fg2)" }}
                  title="How large each room tile becomes in the world — room size and spacing scale together"
                >
                  Room size
                  <input
                    type="number"
                    min={6}
                    max={64}
                    step={1}
                    value={tileMeters}
                    onChange={e => setTileMeters(Math.min(64, Math.max(6, Number(e.target.value) || 16)))}
                    className={`
                      h-7 w-16 rounded-[var(--radius)] border bg-transparent
                      px-2 font-mono text-[12px] outline-none
                    `}
                    style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
                  />
                  m
                </label>
                <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--fg2)" }}>
                  Artwork size
                  <input
                    type="number"
                    min={0.5}
                    max={4}
                    step={0.1}
                    value={artSize}
                    onChange={e => setArtSize(Math.min(4, Math.max(0.5, Number(e.target.value) || 2)))}
                    className={`
                      h-7 w-16 rounded-[var(--radius)] border bg-transparent
                      px-2 font-mono text-[12px] outline-none
                    `}
                    style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
                  />
                  m
                </label>
                <label
                  className="flex cursor-pointer items-center gap-2 text-[11px]"
                  style={{ color: "var(--fg2)" }}
                  title="When updating a world you spawned before: move the rooms back to this layout (otherwise in-world arrangement is kept)"
                >
                  <input
                    type="checkbox"
                    checked={relayout}
                    onChange={e => setRelayout(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  Reapply room layout
                </label>
              </div>

              {mixedContent && (
                <div
                  className={`
                    flex items-start gap-2 rounded-[var(--radius)] border px-3
                    py-2.5 text-[12px]
                  `}
                  style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--fg3)" }}>
                    <IconAlert size={14} />
                  </span>
                  Browsers can&apos;t reach a plain-http world from this https
                  page. Use the world&apos;s https URL — or export the file and
                  spawn with the CLI.
                </div>
              )}

              {error && (
                <div
                  className={`
                    flex items-start gap-2 rounded-[var(--radius)] border px-3
                    py-2.5 text-[12px]
                  `}
                  style={{
                    borderColor: "var(--destructive, oklch(0.55 0.2 25))",
                    color: "var(--fg1)",
                  }}
                >
                  <span className="mt-0.5 shrink-0" style={{ color: "var(--destructive, oklch(0.55 0.2 25))" }}>
                    <IconAlert size={14} />
                  </span>
                  {error}
                </div>
              )}
            </div>
          )}

          {(phase === "spawning" || phase === "done") && (
            <div className="flex flex-col gap-1.5">
              {rooms.map(r => (
                <div
                  key={r.uid}
                  className={`
                    flex items-center gap-2.5 rounded-[var(--radius)] border
                    px-3 py-2
                  `}
                  style={{ borderColor: "var(--border)", background: "var(--card)" }}
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {r.status === "failed"
                      ? (
                          <span style={{ color: "var(--destructive, oklch(0.55 0.2 25))" }}>
                            <IconAlert size={14} />
                          </span>
                        )
                      : [ "created", "updated", "unchanged" ].includes(r.status)
                          ? (
                              <span style={{ color: "var(--accent)" }}>
                                <IconCheck size={14} />
                              </span>
                            )
                          : r.status === "connecting"
                            ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--fg3)" }} />
                            : <Spinner />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]" style={{ color: "var(--fg1)" }}>
                    {r.title}
                  </span>
                  <span
                    className="shrink-0 font-mono text-[10.5px]"
                    style={{
                      color: r.status === "failed"
                        ? "var(--destructive, oklch(0.55 0.2 25))"
                        : "var(--fg3)",
                    }}
                    title={r.error}
                  >
                    {r.error || STATUS_TEXT[r.status] || r.status}
                  </span>
                </div>
              ))}
              {progress?.phase === "verify" && (
                <div className="flex items-center gap-2 px-1 pt-1 text-[11px]" style={{ color: "var(--fg3)" }}>
                  <Spinner /> Verifying the world received everything…
                </div>
              )}
              {phase === "done" && result && (
                <div className="pt-2 text-[12px] leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {result.failed === 0
                    ? (
                        <>
                          <span style={{ color: "var(--fg1)" }}>
                            {result.created > 0 && `${result.created} room${result.created === 1 ? "" : "s"} spawned`}
                            {result.created > 0 && (result.updated > 0 || result.unchanged > 0) && ", "}
                            {result.updated > 0 && `${result.updated} updated`}
                            {result.updated > 0 && result.unchanged > 0 && ", "}
                            {result.unchanged > 0 && `${result.unchanged} already up to date`}
                            {" "}
                            — {result.artworks} artworks, verified in-world.
                          </span>
                          <span className="mt-2 block" style={{ color: "var(--fg3)" }}>
                            Refine inside the world: Tab toggles build mode,
                            right-click a room for its curation controls
                            (artwork scale, placards, lighting), P unpins a room
                            so you can rearrange it — the artworks move with it.
                            Turn on “Slot editing” in a room&apos;s App pane and
                            hold E at any work to nudge and resize it in place.
                            Spawn again anytime to push curation updates — all
                            in-world refinements are kept.
                          </span>
                        </>
                      )
                    : (
                        <span>
                          {result.failed} room{result.failed === 1 ? "" : "s"} failed —
                          if none arrived, double-check the admin key.
                        </span>
                      )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3.5"
          style={{ borderColor: "var(--border)" }}
        >
          {phase === "done"
            ? (
                <>
                  <button
                    onClick={onClose}
                    className={`
                      h-9 rounded-[var(--radius)] px-4 text-sm
                      transition-colors
                    `}
                    style={{ background: "var(--muted)", color: "var(--fg1)" }}
                  >
                    Close
                  </button>
                  <a
                    href={normalizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`
                      flex h-9 items-center gap-2 rounded-[var(--radius)] px-4
                      text-sm transition-transform
                      active:scale-[0.98]
                    `}
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    Walk in
                    <IconExternal size={14} />
                  </a>
                </>
              )
            : (
                <>
                  <button
                    onClick={onClose}
                    disabled={busy}
                    className={`
                      h-9 rounded-[var(--radius)] px-4 text-sm
                      transition-colors
                      disabled:opacity-30
                    `}
                    style={{ background: "var(--muted)", color: "var(--fg1)" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={spawn}
                    disabled={!urlOk || mixedContent || busy}
                    className={`
                      flex h-9 items-center gap-2 rounded-[var(--radius)] px-4
                      text-sm transition-transform
                      active:scale-[0.98]
                      disabled:opacity-30
                    `}
                    style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                  >
                    {busy ? <Spinner /> : <IconGlobe size={15} />}
                    {busy ? "Spawning…" : "Spawn"}
                  </button>
                </>
              )}
        </div>
      </div>
    </div>
  );
}
