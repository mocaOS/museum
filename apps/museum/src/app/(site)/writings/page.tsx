import type { Metadata } from "next";
import writings from "@/content/writings.json";
import WritingsBrowser from "@/components/museum/WritingsBrowser";

export const metadata: Metadata = {
  title: "Writings",
  description:
    "A living reading list of the manifestos, papers, and essays that shaped crypto art and the culture around it.",
};

export default function WritingsPage() {
  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          Study
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          Writings
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          {writings.intro}
        </p>
      </header>
      <WritingsBrowser items={writings.items} />
    </div>
  );
}
