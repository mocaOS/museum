import type { Metadata } from "next";
import timeline from "@/content/timeline.json";

export const metadata: Metadata = {
  title: "Timeline",
  description:
    "An abbreviated history of crypto art — from the first on-chain tributes to the auctions that put NFTs on the world stage.",
  alternates: { canonical: "/timeline" },
};

interface Event {
  date: string;
  title: string;
  description: string;
}

export default function TimelinePage() {
  // Group events by year, newest first.
  const byYear = new Map<string, Event[]>();
  for (const e of timeline.events as Event[]) {
    const y = e.date.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(e);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          History
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          Crypto Art Timeline
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          {timeline.intro}
        </p>
      </header>

      <div className="relative">
        {/* vertical rail */}
        <div
          className="absolute bottom-0 left-[7px] top-2 w-px sm:left-[88px]"
          style={{ background: "var(--border)" }}
          aria-hidden
        />
        <div className="space-y-12">
          {years.map((year) => (
            <section key={year} className="relative">
              <div className="mb-5 flex items-center gap-4">
                <div className="hidden w-20 text-right sm:block">
                  <span
                    className="text-2xl font-semibold"
                    style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}
                  >
                    {year}
                  </span>
                </div>
                <div
                  className="relative z-10 h-3.5 w-3.5 rounded-full border-2"
                  style={{ background: "var(--accent)", borderColor: "var(--bg)" }}
                />
                <span className="text-2xl font-semibold sm:hidden" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}>
                  {year}
                </span>
              </div>
              <div className="ml-7 space-y-3 sm:ml-[108px]">
                {byYear.get(year)!.map((e, i) => (
                  <div
                    key={i}
                    className="rounded-[var(--radius-lg)] border p-4"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                  >
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <h3 className="text-sm font-medium" style={{ color: "var(--fg1)" }}>
                        {e.title}
                      </h3>
                      <span className="shrink-0 text-[11px]" style={{ color: "var(--fg3)", fontFamily: "var(--font-mono)" }}>
                        {e.date}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                      {e.description}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
