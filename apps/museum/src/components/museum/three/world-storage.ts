import type { NftView } from "@/lib/museum/media";

/**
 * Client-side persistence for the exhibition builder, matching the app's
 * localStorage-only convention (see chat history). A layout is the set of
 * placed rooms plus, per placed room, a map of slotId → hung artwork.
 *
 * Stored under "moca-world-layout-v1". Bumped suffix invalidates old shapes.
 */
const STORAGE_KEY = "moca-world-layout-v1";

/** slotId → artwork hung there, for one placed room instance. */
export type Assignments = Record<string, NftView>;

export interface StoredPlacement {
  uid: string;
  roomId: number;
  position: [number, number, number];
  rotationY: number;
  assignments: Assignments;
}

export interface WorldLayout {
  version: 1;
  placements: StoredPlacement[];
}

export function loadWorldLayout(): WorldLayout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorldLayout;
    if (parsed?.version !== 1 || !Array.isArray(parsed.placements)) return null;
    return parsed;
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
