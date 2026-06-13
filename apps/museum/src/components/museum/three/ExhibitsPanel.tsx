"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EXHIBITS_CHANGED_EVENT,
  type StoredExhibit,
  type WorldLayout,
  deleteExhibit,
  listExhibits,
  newExhibitionId,
  renameExhibit,
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
 * The exhibits library (embedded in the builder sidebar). The exhibit being
 * built is ALWAYS here: it appears as “Unnamed exhibit” the first time the
 * builder runs, tracks every change automatically, and can be renamed in
 * place — that name travels into Hyperfy spawns, exports and the museum
 * guide. “Save a copy” snapshots the current world as a separate entry;
 * copies load / update / delete like before.
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

  const refresh = useCallback(() => setExhibits(listExhibits()), []);

  useEffect(() => {
    refresh();
    window.addEventListener(EXHIBITS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EXHIBITS_CHANGED_EVENT, refresh);
  }, [ refresh ]);

  const currentExhibitionId = getLayout().exhibitionId;
  const isCurrent = (e: StoredExhibit) =>
    !!currentExhibitionId && e.layout.exhibitionId === currentExhibitionId;
  // The working exhibit always leads the list.
  const sorted = [ ...exhibits ].sort((a, b) => Number(isCurrent(b)) - Number(isCurrent(a)));

  const handleSaveCopy = () => {
    const fallback = `Exhibit ${new Date().toLocaleDateString()}`;
    // A copy is its own show: a fresh exhibition identity means it never
    // shadows the working exhibit — and loading it later makes IT current.
    const layout = { ...getLayout(), exhibitionId: newExhibitionId() };
    saveExhibit(name.trim() || fallback, layout);
    setName("");
    refresh();
  };

  const handleRename = (e: StoredExhibit) => {
    const next = window.prompt("Exhibit name", e.name);
    if (next?.trim()) {
      renameExhibit(e.id, next.trim());
      refresh();
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Save a copy of the current world */}
      <div className="border-b px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasContent) handleSaveCopy();
            }}
            placeholder="Save a copy as…"
            className={`
              h-9 min-w-0 flex-1 rounded-[var(--radius)] border bg-transparent
              px-3 text-sm outline-none
            `}
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          />
          <button
            onClick={handleSaveCopy}
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
          The exhibit you&apos;re building saves itself — copies are snapshots.
          All stored in this browser.
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.length === 0 && (
          <div className="px-2 py-8 text-center text-xs" style={{ color: "var(--fg3)" }}>
            Place a room and your exhibit appears here automatically.
          </div>
        )}
        {sorted.map((e) => {
          const current = isCurrent(e);
          return (
            <div
              key={e.id}
              className="mb-1.5 rounded-[var(--radius)] border px-3 py-2.5"
              style={{
                borderColor: current ? "var(--accent)" : "var(--border)",
                background: "var(--card)",
              }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <div className="truncate text-sm" style={{ color: "var(--fg1)" }}>
                    {e.name}
                  </div>
                  {current && (
                    <span
                      className={`
                        shrink-0 rounded-full px-1.5 py-px text-[9px]
                        tracking-[0.08em] uppercase
                      `}
                      style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                    >
                      Current
                    </span>
                  )}
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
                {current
                  ? (
                      <button
                        onClick={() => handleRename(e)}
                        className="rounded-full px-2.5 py-1 transition-colors"
                        style={{ background: "var(--muted)", color: "var(--fg1)" }}
                        title="Rename — the name travels into spawns, exports and the guide"
                      >
                        Rename
                      </button>
                    )
                  : (
                      <>
                        <button
                          onClick={() => onLoad(e.layout)}
                          className="rounded-full px-2.5 py-1 transition-colors"
                          style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => {
                            saveExhibit(e.name, { ...getLayout(), exhibitionId: e.layout.exhibitionId }, e.id);
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
                          className={`
                            ml-auto rounded-full px-2.5 py-1 transition-colors
                          `}
                          style={{ background: "var(--muted)", color: "var(--fg2)" }}
                        >
                          Delete
                        </button>
                      </>
                    )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
