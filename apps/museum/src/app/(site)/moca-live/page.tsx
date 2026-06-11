import type { Metadata } from "next";
import mocaLive from "@/content/moca-live.json";
import MocaLiveBrowser, { type MocaLive } from "@/components/museum/MocaLiveBrowser";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "MOCA Live",
  description:
    "Every MOCA livestream — town halls, artist conversations, and shows — watchable on-page, plus the podcast.",
  path: "/moca-live",
});

export default function MocaLivePage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          Live
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          MOCA Live
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          {mocaLive.intro}
        </p>
      </header>
      <MocaLiveBrowser data={mocaLive as MocaLive} />
    </div>
  );
}
