import type { Metadata } from "next";
import Link from "next/link";
import ComingSoonButton from "@/components/site/ComingSoonButton";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Cortex",
  description:
    "Cortex is the memory layer for AI agents — a managed platform that turns your documents into a living knowledge graph agents can read, write, and reason over. Built by the Museum of Crypto Art; the stack beneath Soulweaver and the MOCA Library.",
  path: "/cortex",
  image: "/cortex/hero.jpg",
  imageAlt: "Cortex — the memory layer for AI agents",
});

const PROBLEMS = [
  {
    title: "Cold start",
    text: "Every tool invocation begins contextless. Agents re-derive the same facts about your world, over and over, at your expense.",
  },
  {
    title: "Session amnesia",
    text: "Decisions and preferences learned in one conversation evaporate when the session ends. Nothing compounds.",
  },
  {
    title: "Retrieval unpredictability",
    text: "Plain vector lookups return close-enough chunks with no sense of who relates to what. Confidence without grounding.",
  },
];

const CAPABILITIES = [
  {
    title: "Knowledge graph & GraphRAG",
    text: "Entities, typed relationships, and community summaries are extracted automatically from your documents — then traversed multi-hop at query time.",
  },
  {
    title: "Hybrid retrieval",
    text: "Vector similarity, BM25 keyword matching, and graph traversal in a single query, re-ranked by a cross-encoder. Entity-aware context, not close-enough chunks.",
  },
  {
    title: "Skills hub",
    text: "Portable, plain-text SKILL.md capabilities that flow both ways — import community skills or export your graph's know-how to 30+ agent products.",
  },
  {
    title: "App ecosystem",
    text: "Web crawler, chat interface, GitHub connector, YouTube importer — every connected app deepens the same knowledge graph.",
  },
  {
    title: "API-first",
    text: "60+ REST endpoints with full OpenAPI Docs, webhooks, and background task tracking. Collections namespace knowledge per agent, customer, or use case.",
  },
  {
    title: "Ask AI, with receipts",
    text: "Source-cited answers with streaming responses and an agentic multi-step mode — for humans and agents alike. Nothing asserted without attribution.",
  },
];

const ECOSYSTEM = [
  {
    title: "Powers the Library",
    text: "Every answer in the museum's Library is a Cortex query — collection-scoped search, deep research, and citations over MOCA's institutional memory.",
  },
  {
    title: "Grounds Soulweaver",
    text: "Each onboarded collection gets its own Cortex knowledge graph. Holders contribute lore, curators approve it, and every woven soul cites that shared canon.",
  },
  {
    title: "MOCA flatrate",
    text: "DeCC0 holders and $MOCA stakers get the Enthusiast tier free — the museum's community runs on the same memory layer it helped build.",
  },
];

export default function CortexPage() {
  return (
    <div>
      {/* Hero — the artwork carries the headline */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/cortex/hero.jpg"
          alt="Cortex — the memory layer for AI agents, by the Museum of Crypto Art."
          className="max-h-[560px] w-full object-cover object-center"
        />
      </section>

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        {/* Intro */}
        <section className="mx-auto max-w-3xl py-14 text-center">
          <p
            className="mb-3 text-[11px] uppercase tracking-[0.16em]"
            style={{ color: "var(--fg3)" }}
          >
            By the Museum of Crypto Art
          </p>
          <h1
            className="text-3xl font-semibold sm:text-4xl"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            Cortex is the memory layer for AI agents.
          </h1>
          <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--fg2)" }}>
            Agents tend to forget. Cortex is how your organization remembers — a
            managed platform that turns documents into a living knowledge graph
            agents can read, write, and reason over. Model- and
            framework-agnostic, born from the museum preserving its own
            institutional knowledge, and the technology stack beneath Soulweaver
            and the MOCA Library.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ComingSoonButton label="Launch Cortex" />
            <a
              href="https://docs.cortex.eco"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Cortex Docs
            </a>
          </div>
        </section>

        {/* The problem */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              The problem
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              All the intelligence. None of your context.
            </h2>
            <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
              The difference between a useful agent and a dangerous one is not
              model size but what it knows about your world. Three failures keep
              agents from knowing anything at all:
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {PROBLEMS.map((p) => (
              <div
                key={p.title}
                className="rounded-[var(--radius-lg)] border p-6"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {p.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Capabilities */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              Inside Cortex
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              From documents to intelligence.
            </h2>
            <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
              Drop in PDFs, markdown, repos, or whole websites. Cortex extracts
              the entities and relationships, connects them across document
              boundaries, and serves the result to every agent you run.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {c.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {c.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Cortex × MOCA */}
        <section className="py-10">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div className="max-w-4xl">
              <p
                className="mb-3 text-[11px] uppercase tracking-[0.16em]"
                style={{ color: "var(--fg3)" }}
              >
                Cortex at the museum
              </p>
              <h2
                className="text-2xl font-semibold sm:text-3xl"
                style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
              >
                Proven on one of the world&apos;s largest digital art collections.
              </h2>
              <p className="mt-4 max-w-2xl text-base" style={{ color: "var(--fg2)" }}>
                Cortex didn&apos;t start as a product. It grew out of the applied
                research behind the MOCA Library — and the Library already runs on
                the exact product that&apos;s about to be released. Every question
                you ask it is answered by Cortex, in production, today.
              </p>
            </div>
            <Link
              href="/library"
              className="ml-auto flex h-11 items-center rounded-[var(--radius)] px-6 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Enter the Library
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div
              className="overflow-hidden rounded-[var(--radius-xl)] border"
              style={{ borderColor: "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cortex/library.jpg"
                alt="The Museum of Crypto Art inside the Cortex city — the Library runs on Cortex in production."
                className="h-auto w-full"
              />
            </div>
            <div
              className="overflow-hidden rounded-[var(--radius-xl)] border"
              style={{ borderColor: "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/cortex/library2.jpg"
                alt="Inside the MOCA Library — the Cortex-powered knowledge assistant."
                className="h-auto w-full"
              />
            </div>
          </div>
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {ECOSYSTEM.map((e) => (
              <div
                key={e.title}
                className="rounded-[var(--radius-lg)] border p-6"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {e.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {e.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Closing CTA */}
        <section className="pb-20 pt-6 text-center">
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            Give your agents real memory.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: "var(--fg2)" }}>
            Cortex is the infrastructure behind agents that actually know. Read
            the Docs now — the platform opens soon.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <ComingSoonButton label="Launch Cortex" />
            <a
              href="https://docs.cortex.eco"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Cortex Docs
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
