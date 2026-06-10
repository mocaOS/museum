import type { NftView } from "@/lib/museum/media";

/**
 * Client-side persistence for the exhibition builder, matching the app's
 * localStorage-only convention (see chat history). A layout is the set of
 * placed rooms plus, per placed room, a map of slotId → hung artwork and a
 * map of slotId → move/resize override for that artwork.
 *
 * Two keys:
 * - "moca-world-layout-v1"   — the live working layout (auto-saved on change)
 * - "moca-world-exhibits-v1" — the library of named, explicitly saved exhibits
 */
const STORAGE_KEY = "moca-world-layout-v1";
const EXHIBITS_KEY = "moca-world-exhibits-v1";

/** slotId → artwork hung there, for one placed room instance. */
export type Assignments = Record<string, NftView>;

/** Curator adjustment for one hung artwork: offset along the wall + scale. */
export interface SlotOverride {
  /** Horizontal offset along the wall, room-local units. */
  dx: number;
  /** Vertical offset along the wall, room-local units. */
  dy: number;
  /** Uniform size multiplier on the fitted frame. */
  scale: number;
}

export type SlotOverrides = Record<string, SlotOverride>;

export interface StoredPlacement {
  uid: string;
  roomId: number;
  position: [number, number, number];
  rotationY: number;
  assignments: Assignments;
  overrides?: SlotOverrides;
}

export interface WorldLayout {
  version: 2;
  placements: StoredPlacement[];
}

/** Accepts v1 (no overrides) and v2 payloads; normalizes to v2. */
function normalizeLayout(parsed: unknown): WorldLayout | null {
  const p = parsed as { version?: number; placements?: StoredPlacement[] } | null;
  if (!p || (p.version !== 1 && p.version !== 2) || !Array.isArray(p.placements)) {
    return null;
  }
  return {
    version: 2,
    placements: p.placements.map((pl) => ({
      ...pl,
      assignments: pl.assignments || {},
      overrides: pl.overrides || {},
    })),
  };
}

export function loadWorldLayout(): WorldLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveWorldLayout(layout: WorldLayout): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Quota / private mode — fail silently; the layout stays in memory.
  }
}

export function clearWorldLayout(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

// --- Named exhibits library ---------------------------------------------------

export interface StoredExhibit {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  layout: WorldLayout;
}

interface ExhibitsFile {
  version: 1;
  exhibits: StoredExhibit[];
}

function readExhibits(): StoredExhibit[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXHIBITS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExhibitsFile;
    if (parsed?.version !== 1 || !Array.isArray(parsed.exhibits)) return [];
    return parsed.exhibits.filter((e) => e && e.id && normalizeLayout(e.layout));
  } catch {
    return [];
  }
}

function writeExhibits(exhibits: StoredExhibit[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      EXHIBITS_KEY,
      JSON.stringify({ version: 1, exhibits } satisfies ExhibitsFile)
    );
  } catch {
    /* quota — keep in memory only */
  }
}

/** Newest first. */
export function listExhibits(): StoredExhibit[] {
  return readExhibits().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getExhibit(id: string): StoredExhibit | null {
  return readExhibits().find((e) => e.id === id) ?? null;
}

/** Save a new exhibit, or overwrite an existing one when `id` is given. */
export function saveExhibit(name: string, layout: WorldLayout, id?: string): StoredExhibit {
  const exhibits = readExhibits();
  const now = Date.now();
  const existing = id ? exhibits.find((e) => e.id === id) : undefined;
  const normalized = normalizeLayout(layout) ?? { version: 2 as const, placements: [] };
  if (existing) {
    existing.name = name.trim() || existing.name;
    existing.layout = normalized;
    existing.updatedAt = now;
    writeExhibits(exhibits);
    return existing;
  }
  const exhibit: StoredExhibit = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `ex-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || "Untitled exhibit",
    createdAt: now,
    updatedAt: now,
    layout: normalized,
  };
  exhibits.push(exhibit);
  writeExhibits(exhibits);
  return exhibit;
}

export function renameExhibit(id: string, name: string): void {
  const exhibits = readExhibits();
  const it = exhibits.find((e) => e.id === id);
  if (!it) return;
  it.name = name.trim() || it.name;
  it.updatedAt = Date.now();
  writeExhibits(exhibits);
}

export function deleteExhibit(id: string): void {
  writeExhibits(readExhibits().filter((e) => e.id !== id));
}
