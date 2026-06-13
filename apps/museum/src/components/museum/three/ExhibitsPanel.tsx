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
 * builder runs, tracks every change automatically (no save button), and can be
 * renamed in place — that name travels into Hyperfy spawns, exports and the
 * museum guide. Any entry can be duplicated with one click via the per-item
 * Copy button, which opens a “copy as” modal; copies are independent snapshots
 * that load / update / delete like before.
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
  // The "copy as" modal: which exhibit we're duplicating + the new name.
  const [ copySource, setCopySource ] = useState<StoredExhibit | null>(null);
  const [ copyName, setCopyName ] = useState("");

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

  const openCopy = (e: StoredExhibit) => {
    setCopySource(e);
    setCopyName(`${e.name} copy`);
  };

  const confirmCopy = () => {
    if (!copySource) return;
    // A copy is its own show: a fresh exhibition identity means it never
    // shadows the working exhibit — and loading it later makes IT current.
    const layout = { ...copySource.layout, exhibitionId: newExhibitionId() };
    saveExhibit(copyName.trim() || `${copySource.name} copy`, layout);
    setCopySource(null);
    setCopyName("");
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
      {/* Auto-save notice — no save button; the working exhibit tracks itself. */}
      <div className="border-b px-3 py-2.5 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--fg3)" }}>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>
          The exhibit you&apos;re building saves itself
        </span>{" "}
        — it&apos;s the “Current” entry below. Hit Copy on any exhibit to snapshot
        it as a new one. All stored in this browser.
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
                      <>
                        <button
                          onClick={() => handleRename(e)}
                          className="rounded-full px-2.5 py-1 transition-colors"
                          style={{ background: "var(--muted)", color: "var(--fg1)" }}
                          title="Rename — the name travels into spawns, exports and the guide"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => openCopy(e)}
                          className="rounded-full px-2.5 py-1 transition-colors"
                          style={{ background: "var(--muted)", color: "var(--fg1)" }}
                          title="Save a copy of this exhibit under a new name"
                        >
                          Copy
                        </button>
                      </>
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
                          onClick={() => openCopy(e)}
                          className="rounded-full px-2.5 py-1 transition-colors"
                          style={{ background: "var(--muted)", color: "var(--fg1)" }}
                          title="Save a copy of this exhibit under a new name"
                        >
                          Copy
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

      {/* "Copy as" modal — duplicate any exhibit under a new name in one click. */}
      {copySource && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(2px)" }}
          onClick={() => setCopySource(null)}
        >
          <div
            className="w-full max-w-sm rounded-[var(--radius-xl,16px)] border p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
            onClick={ev => ev.stopPropagation()}
          >
            <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
              Copy “{copySource.name}”
            </div>
            <div className="mt-1 text-[11px]" style={{ color: "var(--fg3)" }}>
              Saves an independent snapshot you can rename, load and spawn on its own.
            </div>
            <input
              autoFocus
              value={copyName}
              onChange={e => setCopyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmCopy();
                if (e.key === "Escape") setCopySource(null);
              }}
              placeholder="New exhibit name…"
              className={`
                mt-3 h-9 w-full rounded-[var(--radius)] border bg-transparent
                px-3 text-sm outline-none
              `}
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCopySource(null)}
                className="h-9 rounded-[var(--radius)] px-4 text-sm transition-colors"
                style={{ background: "var(--muted)", color: "var(--fg1)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCopy}
                className={`
                  h-9 rounded-[var(--radius)] px-4 text-sm transition-transform
                  active:scale-[0.98]
                `}
                style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
              >
                Save copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
