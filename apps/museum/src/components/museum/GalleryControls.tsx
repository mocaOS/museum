"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Props {
  total: number;
  options: { slug: string; name: string }[];
  selectedSub: string;
  search: string;
}

// Search / collection-filter / sort controls. State lives in the URL so the
// server component re-fetches; search is debounced before navigating.
export default function GalleryControls({ total, options, selectedSub, search }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [term, setTerm] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input in sync if the URL changes externally (e.g. back button).
  useEffect(() => setTerm(search), [search]);

  const push = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`, { scroll: false }));
  };

  const onSearch = (value: string) => {
    setTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      push({ search: value || undefined, page: undefined });
    }, 400);
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      <div
        className="flex h-10 items-center rounded-[var(--radius)] border px-4 text-sm"
        style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
      >
        <span style={{ fontFamily: "var(--font-mono)" }}>{total}</span>
        <span className="ml-1.5">{total === 1 ? "work" : "works"}</span>
      </div>

      {options.length > 0 && (
        <select
          value={selectedSub}
          onChange={(e) => push({ sub: e.target.value === "all" ? undefined : e.target.value, page: undefined })}
          className="h-10 rounded-[var(--radius)] border bg-transparent px-3 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        >
          <option value="all" style={{ background: "var(--card)" }}>
            All collections
          </option>
          {options.map((o) => (
            <option key={o.slug} value={o.slug} style={{ background: "var(--card)" }}>
              {o.name}
            </option>
          ))}
        </select>
      )}

      <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
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
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3 -4.3" />
        </svg>
        <input
          value={term}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search by artist or title"
          className="h-10 w-full rounded-[var(--radius)] border bg-transparent pl-9 pr-9 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        />
        {term && (
          <button
            onClick={() => onSearch("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1"
            style={{ color: "var(--fg3)" }}
            aria-label="Clear search"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
