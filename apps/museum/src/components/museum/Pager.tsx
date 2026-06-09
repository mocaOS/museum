"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

interface Props {
  page: number;
  totalPages: number;
}

// Compact page navigation. Writes ?page= to the URL; the server component
// re-fetches the right slice.
export default function Pager({ page, totalPages }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  if (totalPages <= 1) return null;

  const goto = (p: number) => {
    const sp = new URLSearchParams(params.toString());
    if (p <= 1) sp.delete("page");
    else sp.set("page", String(p));
    startTransition(() => {
      router.push(`${pathname}?${sp.toString()}`, { scroll: false });
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    });
  };

  // Window of page numbers around the current page.
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btn =
    "flex h-10 min-w-10 items-center justify-center rounded-[var(--radius)] border px-3 text-sm transition-colors disabled:opacity-40";

  return (
    <div
      className={`mt-10 flex items-center justify-center gap-1.5 ${pending ? "opacity-60" : ""}`}
    >
      <button
        className={btn}
        style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        onClick={() => goto(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
      >
        ‹
      </button>
      {start > 1 && (
        <>
          <PageBtn n={1} active={page === 1} onClick={goto} />
          {start > 2 && <span style={{ color: "var(--fg3)" }}>…</span>}
        </>
      )}
      {pages.map((p) => (
        <PageBtn key={p} n={p} active={p === page} onClick={goto} />
      ))}
      {end < totalPages && (
        <>
          {end < totalPages - 1 && <span style={{ color: "var(--fg3)" }}>…</span>}
          <PageBtn n={totalPages} active={page === totalPages} onClick={goto} />
        </>
      )}
      <button
        className={btn}
        style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        onClick={() => goto(page + 1)}
        disabled={page >= totalPages}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

function PageBtn({
  n,
  active,
  onClick,
}: {
  n: number;
  active: boolean;
  onClick: (p: number) => void;
}) {
  return (
    <button
      onClick={() => onClick(n)}
      className="flex h-10 min-w-10 items-center justify-center rounded-[var(--radius)] border px-3 text-sm transition-colors"
      style={{
        borderColor: active ? "var(--accent)" : "var(--border)",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "var(--accent-fg)" : "var(--fg1)",
      }}
    >
      {n}
    </button>
  );
}
