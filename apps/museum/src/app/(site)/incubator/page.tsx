import type { Metadata } from "next";
import incubator from "@/content/incubator.json";

export const metadata: Metadata = {
  title: "Incubator",
  description: incubator.intro,
};

export default function IncubatorPage() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <header className="mb-12 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          {incubator.mark}
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          {incubator.headline}
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          {incubator.intro}
        </p>
      </header>

      <div className="mb-14 grid gap-4 sm:grid-cols-3">
        {incubator.functions.map((f) => (
          <div
            key={f}
            className="rounded-[var(--radius-lg)] border p-5 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--fg2)" }}
          >
            {f}
          </div>
        ))}
      </div>

      <h2 className="mb-5 text-sm uppercase tracking-[0.12em]" style={{ color: "var(--fg3)" }}>
        Incubated projects
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {incubator.projects.map((p) => (
          <div
            key={p.name}
            className="rounded-[var(--radius-lg)] border p-5"
            style={{ borderColor: "var(--border)", background: "var(--card)" }}
          >
            <h3 className="text-base font-medium" style={{ color: "var(--fg1)" }}>
              {p.name}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
              {p.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
