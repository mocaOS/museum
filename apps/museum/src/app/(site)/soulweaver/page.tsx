import type { Metadata } from "next";
import ComingSoonButton from "@/components/site/ComingSoonButton";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Soulweaver",
  description:
    "Awaken your NFTs. Soulweaver is AI-powered personality synthesis for NFT collections — portable SOUL.md identities, grounded in on-chain DNA and community lore, built on the Cortex knowledge graph by the Museum of Crypto Art.",
  path: "/soulweaver",
  image: "/soulweaver/hero.jpg",
  imageAlt: "Soulweaver — AI-powered personality synthesis for NFT collections",
});

const PIPELINE = [
  {
    step: "01",
    title: "Synthesize",
    text: "On-chain metadata, the artwork itself, and DNA trait extraction fuse into a first character snapshot.",
  },
  {
    step: "02",
    title: "Research",
    text: "Per-trait queries run against the collection's Cortex knowledge graph — community lore becomes ground truth.",
  },
  {
    step: "03",
    title: "Narrate",
    text: "A full character brief takes shape — biography, characterization, confession — refined by a critique pass.",
  },
  {
    step: "04",
    title: "Codex",
    text: "~50+ personality fields across identity, voice, and philosophy crystallize into the character's codex page.",
  },
  {
    step: "05",
    title: "Weave SOUL",
    text: "A user-guided export distills everything into a portable SOUL.md — signed, versioned, ready to run.",
  },
];

const SOUL_FEATURES = [
  {
    title: "~50+ personality fields",
    text: "Identity, voice & cadence, philosophy, confessions, quirks — a whole person, not a trait list.",
  },
  {
    title: "Human-readable. LLM-readable. Framework-agnostic.",
    text: "SOUL.md is plain markdown: drop it into any agent framework as the system prompt and the character simply wakes up.",
  },
  {
    title: "The soul travels with the token",
    text: "keccak256-hashed, EIP-191 signed, pinned to IPFS, and addressed by chain, contract, and token id — the identity outlives any single server and follows ownership.",
  },
  {
    title: "Ready for the agent economy",
    text: "Designed for ERC-8004 trustless-agent registries, ERC-8183 agentic commerce, and ERC-8257 tool registries from day one.",
  },
];

export default function SoulweaverPage() {
  return (
    <div>
      {/* Hero — the artwork carries the headline */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/soulweaver/hero.jpg"
          alt="Awaken your NFTs. Weave them into SOULs. AI-powered personality synthesis for NFT collections."
          className="h-auto w-full"
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
            Soulweaver turns NFTs into AI agents.
          </h1>
          <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--fg2)" }}>
            Every token already carries a story — its traits, its artwork, the lore its
            community has written around it. Soulweaver reads all of it, researches it
            against the collection's Cortex knowledge graph, and weaves it into a living
            personality: a codex page and a portable SOUL file that any AI agent can wear.
            Born from the Art DeCC0s — 10,000 characters, over 100 million words — and now
            open to any collection.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <ComingSoonButton label="Launch Soulweaver" />
            <a
              href="https://docs.museumofcryptoart.com/web3"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Build with souls
            </a>
          </div>
        </section>

        {/* SOUL.md — portable identity */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              The SOUL file
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              A portable identity that travels with the token.
            </h2>
          </div>
          <div
            className="overflow-hidden rounded-[var(--radius-xl)] border"
            style={{ borderColor: "var(--border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/soulweaver/soul-md.jpg"
              alt="SOUL.md — identity, voice and cadence, philosophy, confessions, quirks. Human-readable, LLM-readable, framework-agnostic."
              className="h-auto w-full"
            />
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {SOUL_FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Pipeline */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              How it works
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              Five steps from token to soul.
            </h2>
            <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
              Resumable. Streaming. Grounded in on-chain DNA and community lore.
            </p>
          </div>
          <div
            className="overflow-hidden rounded-[var(--radius-xl)] border"
            style={{ borderColor: "var(--border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/soulweaver/pipeline.jpg"
              alt="Five steps from token to soul: Synthesize, Research, Narrate, Codex, Weave SOUL."
              className="h-auto w-full"
            />
          </div>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {PIPELINE.map((p) => (
              <li
                key={p.step}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
                >
                  {p.step}
                </div>
                <h3 className="mt-2 text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {p.text}
                </p>
              </li>
            ))}
          </ol>
        </section>

        {/* Grounding + open ecosystem */}
        <section className="py-10">
          <div className="grid gap-4 lg:grid-cols-3">
            <div
              className="rounded-[var(--radius-lg)] border p-6"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                Grounded in Cortex
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                Each collection gets its own knowledge graph. Holders upload lore,
                curators approve it, and every generated personality cites that shared
                canon — no hallucinated backstories.
              </p>
            </div>
            <div
              className="rounded-[var(--radius-lg)] border p-6"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                Holder-guided souls
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                The codex is generated; the soul is woven. Owners shape the final export
                with their own instructions before it's signed and published — your
                token, your character.
              </p>
            </div>
            <div
              className="rounded-[var(--radius-lg)] border p-6"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                Open and verifiable
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                Fully open source. Every soul is fetchable through the MOCA API with a
                cryptographic verification block — two checks, no trust in any server
                required.
              </p>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="pb-20 pt-6 text-center">
          <h2
            className="text-2xl font-semibold"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            Your collection has stories to tell.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: "var(--fg2)" }}>
            Onboard a collection, weave your first soul, or wire souls into your own
            agents through the MOCA API.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <ComingSoonButton label="Launch Soulweaver" />
            <a
              href="https://docs.museumofcryptoart.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              MOCA Docs
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
