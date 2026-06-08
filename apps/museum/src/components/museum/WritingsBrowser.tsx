"use client";

import { useMemo, useState } from "react";

interface Writing {
  title: string;
  author: string | null;
  date: string;
  url: string;
  category: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  crypto: "Crypto",
  cryptoart: "Crypto art",
  nft: "NFTs",
  art: "Art",
  politics: "Politics",
};

export default function WritingsBrowser({ items }: { items: Writing[] }) {
  const categories = useMemo(() => {
    const set = new Set(items.map((i) => i.category));
    return ["all", ...Array.from(set)];
  }, [items]);
  const [active, setActive] = useState("all");

  const filtered = useMemo(
    () =>
      (active === "all" ? items : items.filter((i) => i.category === active))
        .slice()
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    [items, active]
  );

  return (
    <>
      <div className="mb-8 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setActive(c)}
            className="rounded-full border px-3.5 py-1.5 text-sm transition-colors"
            style={{
              borderColor: active === c ? "var(--accent)" : "var(--border)",
              background: active === c ? "var(--accent)" : "transparent",
              color: active === c ? "var(--accent-fg)" : "var(--fg2)",
            }}
          >
            {c === "all" ? "All" : CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((w) => (
          <a
            key={w.url}
            href={w.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col justify-between rounded-[var(--radius-lg)] border p-5 transition-transform duration-200 hover:-translate-y-1"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{ background: "var(--muted)", color: "var(--fg2)" }}
                >
                  {CATEGORY_LABELS[w.category] ?? w.category}
                </span>
                <span className="text-[11px]" style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
                  {w.date.slice(0, 4)}
                </span>
              </div>
              <h3 className="text-base font-medium leading-snug" style={{ color: "var(--fg1)" }}>
                {w.title}
              </h3>
              {w.author && (
                <p className="mt-1 text-sm" style={{ color: "var(--fg2)" }}>
                  {w.author}
                </p>
              )}
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs" style={{ color: "var(--accent)" }}>
              Read
              <span className="transition-transform group-hover:translate-x-0.5" aria-hidden>→</span>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}
