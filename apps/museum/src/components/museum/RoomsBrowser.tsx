"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";

export interface RoomView {
  id: number;
  title: string;
  architect?: string | null;
  description?: string | null;
  series?: string | null;
  slots?: number | null;
  modelUrl?: string;
  imageUrl?: string;
}

/**
 * Searchable rooms grid on /rooms. Every card links to the HQ detail
 * viewer at /rooms/[id]. Filtering is all client-side — the full
 * catalogue is already server-rendered, so search costs nothing and stays
 * snappy via useDeferredValue (typing never blocks on re-filtering).
 */
export default function RoomsBrowser({ rooms }: { rooms: RoomView[] }) {
  const [query, setQuery] = useState("");
  const [architect, setArchitect] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  const architectOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rooms) {
      const a = r.architect?.trim();
      if (a && !seen.has(a)) {
        seen.add(a);
        out.push(a);
      }
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [rooms]);

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return rooms.filter((r) => {
      if (architect && (r.architect?.trim() ?? "") !== architect) return false;
      if (!q) return true;
      return [r.title, r.architect, r.series].some((v) =>
        v?.toLowerCase().includes(q),
      );
    });
  }, [rooms, deferredQuery, architect]);

  if (!rooms.length) {
    return (
      <div className="py-20 text-center text-sm" style={{ color: "var(--fg2)" }}>
        No rooms are open right now. Check back soon.
      </div>
    );
  }

  return (
    <>
      <div className="mb-8 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-sm">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: "var(--fg3)" }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search rooms, architects, series…"
              className="h-10 w-full rounded-[var(--radius)] border pl-9 pr-3 text-sm outline-none transition-colors focus:border-[var(--fg3)]"
              style={{
                background: "var(--card)",
                borderColor: "var(--border)",
                color: "var(--fg1)",
              }}
            />
          </div>
          <span className="font-mono text-[11px]" style={{ color: "var(--fg3)" }}>
            {filtered.length === rooms.length
              ? `${rooms.length} rooms`
              : `${filtered.length} of ${rooms.length} rooms`}
          </span>
        </div>

        {architectOptions.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip active={architect === null} onClick={() => setArchitect(null)}>
              All
            </FilterChip>
            {architectOptions.map((a) => (
              <FilterChip
                key={a}
                active={architect === a}
                onClick={() => setArchitect(architect === a ? null : a)}
              >
                {a}
              </FilterChip>
            ))}
          </div>
        )}
      </div>

      {filtered.length ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((room) => (
            <Link
              key={room.id}
              href={`/rooms/${room.id}`}
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
                    decoding="async"
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
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-medium" style={{ color: "var(--fg1)" }}>
                    {room.title}
                  </h2>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {(room.slots ?? 0) > 0 && (
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[10px]"
                        style={{ background: "var(--muted)", color: "var(--fg3)" }}
                      >
                        {room.slots} slots
                      </span>
                    )}
                    {room.modelUrl && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                        style={{ background: "var(--muted)", color: "var(--fg2)" }}
                      >
                        3D
                      </span>
                    )}
                  </div>
                </div>
                {room.architect && (
                  <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
                    by {room.architect}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-sm" style={{ color: "var(--fg2)" }}>
            No rooms match {deferredQuery.trim() ? `“${deferredQuery.trim()}”` : "these filters"}.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setArchitect(null);
            }}
            className="mt-3 text-xs underline-offset-2 hover:underline"
            style={{ color: "var(--fg3)" }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border px-3 py-1 text-xs transition-colors"
      style={
        active
          ? { background: "var(--fg1)", borderColor: "var(--fg1)", color: "var(--bg)" }
          : { background: "transparent", borderColor: "var(--border)", color: "var(--fg2)" }
      }
    >
      {children}
    </button>
  );
}
