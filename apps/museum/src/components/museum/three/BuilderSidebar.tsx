"use client";

import { type ReactNode, useMemo, useState } from "react";
import Link from "next/link";
import ArtworkBrowser from "./ArtworkPicker";
import MultipassImporter from "./MultipassImporter";
import ExhibitsPanel from "./ExhibitsPanel";
import type { SlotWorld, WorldRoom } from "./WorldBuilder";
import type { Assignments, WorldLayout } from "./world-storage";
import type { NftView } from "@/lib/museum/media";

export type SidebarTab = "build" | "curate" | "exhibits";

/** A placed room reduced to what the sidebar needs to render. */
export interface PlacedSummary {
  uid: string;
  title: string;
  architect?: string | null;
  slotsTotal: number;
  slotsFilled: number;
  /** Curator size multiplier (1 = one tile). */
  scale: number;
}

export const SIDEBAR_WIDTH = 340;
export const SIDEBAR_RAIL_WIDTH = 48;

const GLASS = {
  background: "oklch(0.12 0 0 / 0.94)",
  borderColor: "var(--border)",
  backdropFilter: "blur(20px)",
} as const;

/* --- tiny lucide-style outline icons (this app carries no icon dep) -------- */

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

function IconGrid({ size }: { size?: number }) {
  return <Icon size={size}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Icon>;
}
function IconImage({ size }: { size?: number }) {
  return <Icon size={size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.1-3.1a2 2 0 0 0-2.83 0L6 21" />
  </Icon>;
}
function IconAlbum({ size }: { size?: number }) {
  return <Icon size={size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M11 3v8l3-3 3 3V3" />
  </Icon>;
}
function IconPanel({ size }: { size?: number }) {
  return <Icon size={size}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </Icon>;
}
function IconChevronLeft({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="m15 18-6-6 6-6" />
  </Icon>;
}
function IconRotate({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </Icon>;
}
function IconFocus({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="12" cy="12" r="6" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icon>;
}
function IconChevronRight({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="m9 18 6-6-6-6" />
  </Icon>;
}
function IconTrash({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M3 6h18" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </Icon>;
}
function IconDownload({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="m7 10 5 5 5-5" />
    <path d="M12 15V3" />
  </Icon>;
}
function IconSparkles({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M9.94 15.5a2 2 0 0 0-1.44-1.44L2.37 12.5a.5.5 0 0 1 0-.96l6.13-1.58a2 2 0 0 0 1.44-1.44l1.58-6.14a.5.5 0 0 1 .96 0l1.58 6.14a2 2 0 0 0 1.44 1.44l6.13 1.58a.5.5 0 0 1 0 .96l-6.13 1.58a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" />
    <path d="M20 3v4M22 5h-4" />
  </Icon>;
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
function IconMinus({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M5 12h14" />
  </Icon>;
}
function IconPlus({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>;
}
function IconSearch({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Icon>;
}
function IconBot({ size }: { size?: number }) {
  return <Icon size={size}>
    <path d="M12 8V4H8" />
    <rect width="16" height="12" x="4" y="8" rx="2" />
    <path d="M2 14h2M20 14h2M15 13v2M9 13v2" />
  </Icon>;
}
function IconGlobe({ size }: { size?: number }) {
  return <Icon size={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18" />
  </Icon>;
}

/* --- shared small controls -------------------------------------------------- */

function SmallBtn({
  children,
  onClick,
  disabled,
  accent,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  accent?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`
        flex h-7 items-center justify-center gap-1 rounded-full px-2.5
        text-[11px] transition-colors
        disabled:opacity-30
        ${className}
      `}
      style={{
        background: accent ? "var(--accent)" : "var(--muted)",
        color: accent ? "var(--accent-fg)" : "var(--fg1)",
      }}
    >
      {children}
    </button>
  );
}

/* --- build tab: searchable room library ------------------------------------- */

function RoomLibrary({
  rooms,
  placingId,
  onTogglePlacing,
}: {
  rooms: WorldRoom[];
  placingId: number | null;
  onTogglePlacing: (room: WorldRoom) => void;
}) {
  const [ q, setQ ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rooms;
    return rooms.filter(
      r =>
        r.title.toLowerCase().includes(t)
        || (r.architect || "").toLowerCase().includes(t),
    );
  }, [ rooms, q ]);

  return (
    <>
      <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="relative">
          <span
            className={`
              pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2
            `}
            style={{ color: "var(--fg3)" }}
          >
            <IconSearch size={14} />
          </span>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search rooms or architects"
            className={`
              h-9 w-full rounded-[var(--radius)] border bg-transparent pr-3 pl-8
              text-sm outline-none
            `}
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          />
        </div>
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--fg3)" }}>
          Pick a room, then click the ground to place it.
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map((r) => {
            const active = placingId === r.id;
            return (
              <button
                key={r.id}
                onClick={() => onTogglePlacing(r)}
                className={`
                  group overflow-hidden rounded-[var(--radius)] border text-left
                  transition-transform
                  hover:-translate-y-0.5
                `}
                style={{
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  background: "var(--card)",
                }}
                title={active ? "Stop placing" : `Place ${r.title}`}
              >
                <div className="aspect-square overflow-hidden" style={{ background: "var(--muted)" }}>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.imageUrl} alt={r.title} loading="lazy" className={`
                      h-full w-full object-cover
                    `} />
                  ) : null}
                </div>
                <div
                  className="truncate px-1.5 py-1 text-[10px]"
                  style={{ color: active ? "var(--accent)" : "var(--fg2)" }}
                >
                  {active ? "Placing — click the ground" : r.title}
                </div>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="py-10 text-center text-xs" style={{ color: "var(--fg3)" }}>
            No rooms match “{q}”.
          </div>
        )}
      </div>
    </>
  );
}

/* --- the sidebar ------------------------------------------------------------- */

export default function BuilderSidebar({
  tab,
  onTabChange,
  collapsed,
  onToggleCollapse,
  rooms,
  placingId,
  onTogglePlacing,
  placed,
  selectedUid,
  onSelectRoom,
  onRotateRoom,
  onRemoveRoom,
  onCurate,
  onClearWorld,
  curating,
  slots,
  curAssignments,
  activeSlotId,
  onSelectSlot,
  onExitCurate,
  onAutoFill,
  autoBusy,
  activeArt,
  activeScale,
  canScaleUp,
  canScaleDown,
  onScaleActive,
  onResetActive,
  onClearActive,
  onPickArt,
  getLayout,
  hasContent,
  onLoadLayout,
  onExport,
  onSpawn,
  onGuide,
  onScaleRoom,
  onSetSpawn,
  onClearSpawn,
  hasSpawn,
  onSetGuide,
  onClearGuide,
  hasGuide,
  onBrowserQuery,
}: {
  tab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // build
  rooms: WorldRoom[];
  placingId: number | null;
  onTogglePlacing: (room: WorldRoom) => void;
  placed: PlacedSummary[];
  selectedUid: string | null;
  onSelectRoom: (uid: string) => void;
  onRotateRoom: (uid: string) => void;
  onRemoveRoom: (uid: string) => void;
  onCurate: (uid: string) => void;
  onClearWorld: () => void;
  // curate
  curating: { uid: string; title: string } | null;
  slots: SlotWorld[];
  curAssignments: Assignments;
  activeSlotId: string | null;
  onSelectSlot: (id: string) => void;
  onExitCurate: () => void;
  onAutoFill: () => void;
  autoBusy: boolean;
  activeArt: NftView | null;
  activeScale: number;
  canScaleUp: boolean;
  canScaleDown: boolean;
  onScaleActive: (dir: 1 | -1) => void;
  onResetActive: () => void;
  onClearActive: () => void;
  onPickArt: (art: NftView) => void;
  // exhibits
  getLayout: () => WorldLayout;
  hasContent: boolean;
  onLoadLayout: (layout: WorldLayout) => void;
  onExport: () => void;
  onSpawn: () => void;
  onGuide: () => void;
  onScaleRoom: (uid: string, dir: 1 | -1) => void;
  onSetSpawn: () => void;
  onClearSpawn: () => void;
  hasSpawn: boolean;
  onSetGuide: () => void;
  onClearGuide: () => void;
  hasGuide: boolean;
  onBrowserQuery: (q: { slugs: string | null; search: string }) => void;
}) {
  const TABS: { id: SidebarTab; label: string; icon: ReactNode }[] = [
    { id: "build", label: "Build", icon: <IconGrid /> },
    { id: "curate", label: "ROOMs", icon: <IconImage /> },
    { id: "exhibits", label: "Exhibits", icon: <IconAlbum /> },
  ];

  const selected = selectedUid ? placed.find(p => p.uid === selectedUid) ?? null : null;
  const totalWorks = placed.reduce((sum, p) => sum + p.slotsFilled, 0);
  const filledCount = curating ? Object.keys(curAssignments).length : 0;

  // Where the curate browser pulls works from: the museum collections, or a
  // wallet's legacy MOCA curations (the Multipass importer).
  const [ curateSrc, setCurateSrc ] = useState<"moca" | "multipass">("moca");

  if (collapsed) {
    return (
      <div
        className={`
          pointer-events-auto absolute top-0 bottom-0 left-0 z-30 flex flex-col
          items-center gap-1 border-r py-2
        `}
        style={{ ...GLASS, width: SIDEBAR_RAIL_WIDTH }}
      >
        <button
          onClick={onToggleCollapse}
          className={`
            flex h-9 w-9 items-center justify-center rounded-[var(--radius)]
            transition-colors
          `}
          style={{ color: "var(--fg2)" }}
          title="Open panel"
        >
          <IconPanel size={17} />
        </button>
        <div className="my-1 h-px w-7" style={{ background: "var(--border)" }} />
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => {
              onTabChange(t.id);
              onToggleCollapse();
            }}
            className={`
              flex h-9 w-9 items-center justify-center rounded-[var(--radius)]
              transition-colors
            `}
            style={{
              color: tab === t.id ? "var(--accent)" : "var(--fg2)",
              background: tab === t.id ? "var(--muted)" : "transparent",
            }}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`
        pointer-events-auto absolute top-0 bottom-0 left-0 z-30 flex flex-col
        border-r
      `}
      style={{ ...GLASS, width: SIDEBAR_WIDTH }}
    >
      {/* Header */}
      <div className="border-b px-4 pt-3 pb-3" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between">
          <Link
            href="/rooms"
            className={`
              flex items-center gap-1 text-[11px] transition-colors
              hover:opacity-80
            `}
            style={{ color: "var(--fg3)" }}
          >
            <IconChevronLeft size={13} />
            MOCA ROOMs
          </Link>
          <button
            onClick={onToggleCollapse}
            className={`
              flex h-7 w-7 items-center justify-center rounded-[var(--radius)]
              transition-colors
            `}
            style={{ color: "var(--fg3)" }}
            title="Collapse panel"
          >
            <IconPanel size={16} />
          </button>
        </div>
        <div className="mt-1 text-sm font-medium" style={{ color: "var(--fg1)" }}>
          World builder
        </div>
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}
        >
          {placed.length} room{placed.length === 1 ? "" : "s"} · {totalWorks} work
          {totalWorks === 1 ? "" : "s"}
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b p-1.5" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`
                flex h-8 items-center justify-center gap-1.5
                rounded-[var(--radius)] text-[11px] transition-colors
              `}
              style={{
                background: active ? "var(--muted)" : "transparent",
                color: active ? "var(--accent)" : "var(--fg2)",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ---- Build ---- */}
      <div
        className="min-h-0 flex-1 flex-col"
        style={{ display: tab === "build" ? "flex" : "none" }}
      >
        {selected && !curating && (
          <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="text-[10px] tracking-[0.08em] uppercase" style={{ color: "var(--fg3)" }}>
              Selected room
            </div>
            <div className="mt-0.5 truncate text-sm" style={{ color: "var(--fg1)" }}>
              {selected.title}
            </div>
            {selected.architect && (
              <div className="truncate text-[11px]" style={{ color: "var(--fg3)" }}>
                {selected.architect}
              </div>
            )}
            <div className="mt-2 flex items-center gap-1.5">
              <SmallBtn accent onClick={() => onCurate(selected.uid)} title="Hang artworks (C)">
                Curate {selected.slotsFilled}/{selected.slotsTotal}
              </SmallBtn>
              <SmallBtn onClick={() => onSelectRoom(selected.uid)} title="Focus (F)">
                <IconFocus size={13} />
              </SmallBtn>
              <SmallBtn onClick={() => onRotateRoom(selected.uid)} title="Rotate 45° (R)">
                <IconRotate size={13} />
              </SmallBtn>
              <SmallBtn onClick={() => onScaleRoom(selected.uid, -1)} title="Shrink room">
                <IconMinus size={13} />
              </SmallBtn>
              <span
                className="text-[10px]"
                style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}
                title="Native room scale — the base size it spawns at in Hyperfy (resize further in-world: grab + Shift+scroll)"
              >
                {Math.round((selected.scale || 1) * 100)}%
              </span>
              <SmallBtn onClick={() => onScaleRoom(selected.uid, 1)} title="Enlarge room">
                <IconPlus size={13} />
              </SmallBtn>
              <SmallBtn
                onClick={() => onRemoveRoom(selected.uid)}
                title="Remove room (Del)"
                className="ml-auto"
              >
                <IconTrash size={13} />
              </SmallBtn>
            </div>
          </div>
        )}
        <RoomLibrary rooms={rooms} placingId={placingId} onTogglePlacing={onTogglePlacing} />
        <div
          className={`
            flex items-center justify-between border-t px-3 py-2 text-[11px]
          `}
          style={{ borderColor: "var(--border)" }}
        >
          <span style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
            {rooms.length} rooms available
          </span>
          <button
            onClick={onClearWorld}
            disabled={!hasContent}
            className={`
              rounded-full px-2.5 py-1 transition-colors
              disabled:opacity-30
            `}
            style={{ color: "var(--fg2)", background: "var(--muted)" }}
          >
            Clear world
          </button>
        </div>
      </div>

      {/* ---- Curate ---- */}
      <div
        className="min-h-0 flex-1 flex-col"
        style={{ display: tab === "curate" ? "flex" : "none" }}
      >
        {!curating && placed.length === 0 && (
          <div className="px-6 py-10 text-center text-xs" style={{ color: "var(--fg3)" }}>
            <p>No ROOMs placed yet — place one first.</p>
            <button
              onClick={() => onTabChange("build")}
              className={`
                mt-3 rounded-full px-3 py-1.5 text-[11px] transition-transform
                active:scale-[0.98]
              `}
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Browse rooms
            </button>
          </div>
        )}
        {!curating && placed.length > 0 && (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {placed.map((p) => {
                const pct = p.slotsTotal ? Math.round((p.slotsFilled / p.slotsTotal) * 100) : 0;
                const isSel = p.uid === selectedUid;
                return (
                  <button
                    key={p.uid}
                    onClick={() => onCurate(p.uid)}
                    className={`
                      mb-1.5 block w-full rounded-[var(--radius)] border px-3
                      py-2.5 text-left transition-colors
                    `}
                    style={{
                      borderColor: isSel ? "var(--accent)" : "var(--border)",
                      background: "var(--card)",
                    }}
                    title={`Curate “${p.title}”`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm" style={{ color: "var(--fg1)" }}>
                          {p.title}
                        </div>
                        <div className="mt-0.5 text-[11px]" style={{ color: "var(--fg3)" }}>
                          {p.slotsFilled}/{p.slotsTotal} slots filled
                        </div>
                      </div>
                      <span className="shrink-0" style={{ color: "var(--fg3)" }}>
                        <IconChevronRight size={14} />
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1 overflow-hidden rounded-full"
                      style={{ background: "var(--muted)" }}
                    >
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: "var(--accent)" }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
        )}
        {curating && (
          <>
            {/* Curating header */}
            <div
              className={`
                flex items-center justify-between gap-2 border-b px-3 py-2.5
              `}
              style={{ borderColor: "var(--border)" }}
            >
              <div className="min-w-0">
                <div
                  className="text-[10px] tracking-[0.08em] uppercase"
                  style={{ color: "var(--accent)" }}
                >
                  Curate
                </div>
                <div className="truncate text-sm" style={{ color: "var(--fg1)" }}>
                  {curating.title}
                </div>
                <div className="text-[11px]" style={{ color: "var(--fg3)" }}>
                  {filledCount}/{slots.length} slots filled
                </div>
              </div>
              <SmallBtn accent onClick={onExitCurate} title="Finish curating (Esc)">
                <IconCheck size={13} />
                Done
              </SmallBtn>
            </div>

            {/* Slot chips */}
            <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <div className="mb-1.5 flex items-center justify-between">
                <span
                  className="text-[10px] tracking-[0.08em] uppercase"
                  style={{ color: "var(--fg3)" }}
                >
                  Slots
                </span>
                <button
                  onClick={onAutoFill}
                  disabled={autoBusy || filledCount >= slots.length}
                  className={`
                    flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]
                    transition-colors
                    disabled:opacity-30
                  `}
                  style={{ color: "var(--accent)" }}
                  title="Fill every empty slot with random works"
                >
                  <IconSparkles size={12} />
                  {autoBusy ? "Filling…" : "Auto-fill"}
                </button>
              </div>
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {slots.map((s) => {
                  const filled = !!curAssignments[s.id];
                  const active = activeSlotId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => onSelectSlot(s.id)}
                      className={`
                        relative flex h-8 w-8 items-center justify-center
                        rounded-[var(--radius-sm)] border text-[11px]
                        transition-colors
                      `}
                      style={{
                        fontFamily: "var(--font-mono)",
                        borderColor: active ? "var(--accent)" : "var(--border)",
                        background: active ? "var(--accent)" : filled ? "var(--muted)" : "transparent",
                        color: active ? "var(--accent-fg)" : "var(--fg1)",
                      }}
                      title={`Fly to slot ${s.index}${filled ? " (filled)" : ""}`}
                    >
                      {s.index}
                      {filled && !active && (
                        <span
                          className={`
                            absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full
                          `}
                          style={{ background: "var(--accent)" }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active slot */}
            <div
              className="border-b px-3 py-2.5 text-[11px]"
              style={{ borderColor: "var(--border)" }}
            >
              {activeArt
                ? (
                <>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate" style={{ color: "var(--fg1)" }}>
                      {activeArt.name || "Untitled"}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}
                    >
                      {Math.round(activeScale * 100)}%
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <SmallBtn onClick={() => onScaleActive(-1)} disabled={!canScaleDown} title="Smaller">
                      <IconMinus size={13} />
                    </SmallBtn>
                    <SmallBtn onClick={() => onScaleActive(1)} disabled={!canScaleUp} title="Larger">
                      <IconPlus size={13} />
                    </SmallBtn>
                    <SmallBtn onClick={onResetActive} title="Reset position and size">
                      Reset
                    </SmallBtn>
                    <SmallBtn onClick={onClearActive} title="Take down (Del)" className={`
                      ml-auto
                    `}>
                      <IconTrash size={13} />
                    </SmallBtn>
                  </div>
                  <div className="mt-1.5" style={{ color: "var(--fg3)" }}>
                    Drag the work to move it · corner dot resizes
                  </div>
                </>
                  )
                : activeSlotId
                  ? (
                <span style={{ color: "var(--fg2)" }}>Pick a work below to hang it.</span>
                    )
                  : (
                <span style={{ color: "var(--fg3)" }}>
                  Click any artwork below — it hangs in the first free slot.
                  Or pick a slot number / glowing frame first.
                </span>
                    )}
            </div>

            {/* Source toggle: museum collections vs a wallet's Multipass curations */}
            <div
              className="grid grid-cols-2 gap-1 border-b p-1.5"
              style={{ borderColor: "var(--border)" }}
            >
              {([ "moca", "multipass" ] as const).map((src) => {
                const active = curateSrc === src;
                return (
                  <button
                    key={src}
                    onClick={() => setCurateSrc(src)}
                    className={`
                      flex h-8 items-center justify-center rounded-[var(--radius)]
                      text-[11px] transition-colors
                    `}
                    style={{
                      background: active ? "var(--muted)" : "transparent",
                      color: active ? "var(--accent)" : "var(--fg2)",
                    }}
                    title={
                      src === "moca"
                        ? "Browse the museum's collections"
                        : "Import a wallet's past MOCA curations"
                    }
                  >
                    {src === "moca" ? "MOCA collections" : "Multipass"}
                  </button>
                );
              })}
            </div>
            {curateSrc === "moca" ? (
              <ArtworkBrowser canPick onPick={onPickArt} onQuery={onBrowserQuery} />
            ) : (
              <MultipassImporter canPick onPick={onPickArt} />
            )}
          </>
        )}
      </div>

      {/* ---- Exhibits ---- */}
      <div
        className="min-h-0 flex-1 flex-col"
        style={{ display: tab === "exhibits" ? "flex" : "none" }}
      >
        <ExhibitsPanel getLayout={getLayout} hasContent={hasContent} onLoad={onLoadLayout} />
        <div className="flex flex-col gap-2 border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-1.5">
            <SmallBtn onClick={onSetSpawn} title="Click the ground in the 3D view to choose where visitors enter the Hyperfy world, then aim which way they face">
              <IconFocus size={13} />
              {hasSpawn ? "Move spawn point" : "Set spawn point"}
            </SmallBtn>
            {hasSpawn && (
              <SmallBtn onClick={onClearSpawn} title="Remove the custom spawn point">
                <IconClose size={13} />
              </SmallBtn>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <SmallBtn onClick={onSetGuide} title="Click the ground in the 3D view to place the museum guide, then aim which way it faces (otherwise it auto-places by the entrance)">
              <IconFocus size={13} />
              {hasGuide ? "Move guide spawn" : "Set guide spawn"}
            </SmallBtn>
            {hasGuide && (
              <SmallBtn onClick={onClearGuide} title="Remove the custom guide spawn (back to auto-placement)">
                <IconClose size={13} />
              </SmallBtn>
            )}
          </div>
          <button
            onClick={onSpawn}
            disabled={!hasContent}
            className={`
              flex h-9 w-full items-center justify-center gap-2
              rounded-[var(--radius)] text-sm transition-transform
              active:scale-[0.98]
              disabled:opacity-30
            `}
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            title="Spawn this exhibition into a self-hosted Hyperfy world — world URL + admin key is all it takes"
          >
            <IconGlobe size={15} />
            Spawn to Hyperfy
          </button>
          <button
            onClick={onGuide}
            disabled={!hasContent}
            className={`
              flex h-9 w-full items-center justify-center gap-2
              rounded-[var(--radius)] text-sm transition-transform
              active:scale-[0.98]
              disabled:opacity-30
            `}
            style={{ background: "var(--muted)", color: "var(--fg1)" }}
            title="Send the AI museum guide into the exhibition — pick an Art DeCC0, a Soulweaver soul, or upload a SOUL.md"
          >
            <IconBot size={15} />
            Museum guide
          </button>
          <button
            onClick={onExport}
            disabled={!hasContent}
            className={`
              flex h-9 w-full items-center justify-center gap-2
              rounded-[var(--radius)] text-sm transition-transform
              active:scale-[0.98]
              disabled:opacity-30
            `}
            style={{ background: "var(--muted)", color: "var(--fg1)" }}
            title="Download this exhibition as a portable file (spawn it later with the CLI)"
          >
            <IconDownload size={15} />
            Export file
          </button>
        </div>
      </div>
    </div>
  );
}
