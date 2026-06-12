"use client";

import { useEffect, useState } from "react";
import {
  type StoredExhibit,
  type WorldLayout,
  deleteExhibit,
  listExhibits,
  saveExhibit,
} from "./world-storage";

function countWorks(layout: WorldLayout): number {
  return layout.placements.reduce(
    (sum, p) => sum + Object.keys(p.assignments || {}).length,
    0,
  );
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The saved-exhibits library (embedded in the builder sidebar): name and save
 * the current world (rooms + placement + hung artworks + per-slot adjustments)
 * to localStorage, and load / update / delete previously saved exhibits.
 */
export default function ExhibitsPanel({
  getLayout,
  hasContent,
  onLoad,
}: {
  /** Snapshot of the current working layout. */
  getLayout: () => WorldLayout;
  /** Whether the working layout has anything worth saving. */
  hasContent: boolean;
  onLoad: (layout: WorldLayout) => void;
}) {
  const [ exhibits, setExhibits ] = useState<StoredExhibit[]>([]);
  const [ name, setName ] = useState("");

  useEffect(() => {
    setExhibits(listExhibits());
  }, []);

  const refresh = () => setExhibits(listExhibits());

  const handleSave = () => {
    const fallback = `Exhibit ${new Date().toLocaleDateString()}`;
    saveExhibit(name.trim() || fallback, getLayout());
    setName("");
    refresh();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Save current */}
      <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasContent) handleSave();
            }}
            placeholder="Name this exhibit"
            className={`
              h-9 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent
              px-3 text-sm outline-none
            `}
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          />
          <button
            onClick={handleSave}
            disabled={!hasContent}
            className={`
              h-9 shrink-0 rounded-[var(--radius)] px-3 text-sm font-medium
              transition-transform
              active:scale-[0.98]
              disabled:opacity-30
            `}
            style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
          >
            Save
          </button>
        </div>
        <div className="mt-1.5 text-[11px]" style={{ color: "var(--fg3)" }}>
          Exhibits are stored in this browser.
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {exhibits.length === 0 && (
          <div className="px-2 py-8 text-center text-xs" style={{ color: "var(--fg3)" }}>
            No saved exhibits yet. Build a world, then save it here.
          </div>
        )}
        {exhibits.map(e => (
          <div
            key={e.id}
            className="mb-1.5 rounded-[var(--radius)] border px-3 py-2.5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate text-sm" style={{ color: "var(--fg1)" }}>
                {e.name}
              </div>
              <div
                className="shrink-0 text-[10px]"
                style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}
              >
                {formatDate(e.updatedAt)}
              </div>
            </div>
            <div className="mt-0.5 text-[11px]" style={{ color: "var(--fg3)" }}>
              {e.layout.placements.length} room{e.layout.placements.length === 1 ? "" : "s"} ·{" "}
              {countWorks(e.layout)} work{countWorks(e.layout) === 1 ? "" : "s"}
            </div>
            <div className="mt-2 flex gap-1.5 text-[11px]">
              <button
                onClick={() => onLoad(e.layout)}
                className="rounded-full px-2.5 py-1 transition-colors"
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Load
              </button>
              <button
                onClick={() => {
                  saveExhibit(e.name, getLayout(), e.id);
                  refresh();
                }}
                disabled={!hasContent}
                className={`
                  rounded-full px-2.5 py-1 transition-colors
                  disabled:opacity-30
                `}
                style={{ background: "var(--muted)", color: "var(--fg1)" }}
                title="Overwrite this exhibit with the current world"
              >
                Update
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`Delete “${e.name}”? This can't be undone.`)) {
                    deleteExhibit(e.id);
                    refresh();
                  }
                }}
                className="ml-auto rounded-full px-2.5 py-1 transition-colors"
                style={{ background: "var(--muted)", color: "var(--fg2)" }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
