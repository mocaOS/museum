"use client";

import { useEffect, useRef, useState } from "react";
import { proxiedUrl, resolveMediaUrl, type NftView } from "@/lib/museum/media";

interface CollectionOption {
  slug: string;
  name: string;
  slugs: string[];
  depth: number;
}

interface ArtworksResponse {
  artworks: NftView[];
  total: number;
  page: number;
  perPage: number;
}

/** Small still thumbnail for a grid card (cheap proxied webp). */
function thumbUrl(art: NftView): string {
  const still = art.preview ?? art.display;
  const raw = resolveMediaUrl(still?.url);
  if (!raw) return "";
  return proxiedUrl(raw, { width: 240, format: "webp", q: 70 });
}

/**
 * In-canvas artwork browser for the exhibition builder. Lets a curator search
 * by title/artist and scope to a collection (or all), then click a work to
 * hang it on the active wall slot. Data comes from /api/museum/* so it can run
 * client-side inside the 3D builder.
 */
export default function ArtworkPicker({
  activeSlotLabel,
  onPick,
  onClose,
}: {
  /** Human label for the slot currently being filled, e.g. "Slot 3". */
  activeSlotLabel: string | null;
  onPick: (art: NftView) => void;
  onClose: () => void;
}) {
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [scope, setScope] = useState<string>("all"); // collection slug or "all"
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ArtworksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load collection options once.
  useEffect(() => {
    fetch("/api/museum/collections")
      .then((r) => r.json())
      .then((d) => setCollections(d.collections || []))
      .catch(() => setCollections([]));
  }, []);

  // Debounce the search box into the committed `search` term.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(term);
      setPage(1);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [term]);

  // Fetch artworks whenever scope / search / page changes.
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const params = new URLSearchParams();
    if (scope !== "all") {
      const opt = collections.find((c) => c.slug === scope);
      if (opt) params.set("slugs", opt.slugs.join(","));
    }
    if (search.trim()) params.set("search", search.trim());
    params.set("page", String(page));
    fetch(`/api/museum/artworks?${params.toString()}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: ArtworksResponse) => setData(d))
      .catch((e) => {
        if (e.name !== "AbortError") setData({ artworks: [], total: 0, page, perPage: 24 });
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [scope, search, page, collections]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;

  return (
    <div
      className="pointer-events-auto absolute bottom-0 left-0 top-0 z-30 flex w-[360px] flex-col border-r"
      style={{
        background: "oklch(0.12 0 0 / 0.94)",
        borderColor: "var(--border)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div>
          <div className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
            Hang artwork
          </div>
          <div className="mt-0.5 text-[11px]" style={{ color: "var(--fg3)" }}>
            {activeSlotLabel ? `Filling ${activeSlotLabel}` : "Select a slot in the room"}
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ color: "var(--fg2)", background: "var(--muted)" }}
          aria-label="Close"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Controls */}
      <div className="space-y-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setPage(1);
          }}
          className="h-9 w-full rounded-[var(--radius)] border bg-transparent px-2 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        >
          <option value="all" style={{ background: "var(--card)" }}>
            All collections
          </option>
          {collections.map((c) => (
            <option key={c.slug} value={c.slug} style={{ background: "var(--card)" }}>
              {c.depth > 0 ? `\u00A0\u00A0\u2014 ${c.name}` : c.name}
            </option>
          ))}
        </select>

        <div className="relative">
          <svg
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--fg3)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3 -4.3" />
          </svg>
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by artist or title"
            className="h-9 w-full rounded-[var(--radius)] border bg-transparent pl-8 pr-3 text-sm outline-none"
            style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--fg3)" }}>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            {data ? `${data.total} works` : "…"}
          </span>
          {loading && <span>loading…</span>}
        </div>
      </div>

      {/* Results grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!activeSlotLabel && (
          <div className="mb-3 rounded-[var(--radius)] border px-3 py-2 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--fg3)" }}>
            Click a glowing slot inside the room, then pick a work to hang it.
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          {data?.artworks.map((art) => {
            const t = thumbUrl(art);
            const disabled = !activeSlotLabel;
            return (
              <button
                key={art.id}
                onClick={() => activeSlotLabel && onPick(art)}
                disabled={disabled}
                className="group overflow-hidden rounded-[var(--radius)] border text-left transition-transform enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
                title={`${art.name || "Untitled"}${art.artist_name ? ` · ${art.artist_name}` : ""}`}
              >
                <div className="aspect-square overflow-hidden" style={{ background: "var(--muted)" }}>
                  {t ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t} alt={art.name || "Artwork"} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px]" style={{ color: "var(--fg3)" }}>
                      {art.isVideo ? "video" : "no preview"}
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <div className="truncate text-[11px]" style={{ color: "var(--fg1)" }}>
                    {art.name || "Untitled"}
                  </div>
                  {art.artist_name && (
                    <div className="truncate text-[10px]" style={{ color: "var(--fg3)" }}>
                      {art.artist_name}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        {data && data.artworks.length === 0 && !loading && (
          <div className="py-10 text-center text-xs" style={{ color: "var(--fg3)" }}>
            No artworks found.
          </div>
        )}
      </div>

      {/* Pager */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2.5 text-xs" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-full px-3 py-1 transition-colors disabled:opacity-30"
            style={{ color: "var(--fg1)", background: "var(--muted)" }}
          >
            Prev
          </button>
          <span style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-full px-3 py-1 transition-colors disabled:opacity-30"
            style={{ color: "var(--fg1)", background: "var(--muted)" }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
