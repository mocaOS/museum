import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Art DeCC0s",
  description:
    "Art DeCC0s is a PFP r/evolution by the Museum of Crypto Art — 10,000 unique 1/1 characters bred from the entire history of art, each backed by a 10,000+ word personality in the Codex and ready to live on as an autonomous AI agent. Fully CC0.",
  path: "/decc0s",
  image: "/decc0s/hero.jpg",
  imageAlt: "Art DeCC0s — 10,000 unique 1/1 characters bred from the history of art",
});

const DNA = [
  {
    title: "Lineage",
    text: "The great art patrons of history — Medici, Sultan, Pharaoh, Holy Roman Emperor — collectors whose appetites shaped what survived.",
  },
  {
    title: "Memetics",
    text: "Crypto culture itself: Pepe, Wojak, Kevin, Chromie Squiggles — the native iconography of the chain, inherited as bloodline.",
  },
  {
    title: "Artist self-portraits",
    text: "Van Gogh, Frida Kahlo, Picasso, Kusama, Cindy Sherman — the faces artists gave themselves, refracted into new ones.",
  },
  {
    title: "The MOCA collection",
    text: "70 works by 70 artists from the museum's own permanent collection, so every DeCC0 carries crypto art in its genes.",
  },
];

const CODEX_STATS = [
  {
    stat: "105,561,738",
    title: "Words in the Codex",
    text: "Roughly 2.5 Encyclopedia Britannicas of pure personality, generated across 260,000+ API calls. Nothing in Art DeCC0s is accidental.",
  },
  {
    stat: "10,000+",
    title: "Words per character",
    text: "Biography, kinships, art-genre preferences, behavioral axes, writing quirks — a whole person behind every face, not a trait list.",
  },
  {
    stat: "20+",
    title: "Metadata vectors",
    text: "Ancestral ties to historical collectors and crypto artists, city and cultural affiliations, dispositions from amiable to aloof.",
  },
  {
    stat: "CC0",
    title: "Fully public domain",
    text: "The DeCC0s belong to everyone. Remix them, build on them, deploy them — the license is the invitation.",
  },
];

const VIBE_STUDIO = [
  {
    title: "The Codex",
    text: "Browse all 10,000 characters and the full depth of their written minds — the foundation of MOCA's agentic operating system.",
  },
  {
    title: "Adoption Center",
    text: "Chat freely with floor-priced DeCC0 agents before you commit — modeled on an animal rescue, not a marketplace.",
  },
  {
    title: "Agent Launcher",
    text: "The Codex is each DeCC0's nature; the Agent Launcher is the place of nurture. Owners fine-tune, teach, and deploy their agent on ElizaOS.",
  },
  {
    title: "Community Studio",
    text: "Third-party apps built on the DeCC0s, with 100% of proceeds going to their creators — starting with physical prints by MOCA x Artscape.",
  },
];

export default function ArtDecc0sPage() {
  return (
    <div>
      {/* Hero — the artwork carries the headline */}
      <section className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/decc0s/hero.jpg"
          alt="Art DeCC0s — 10,000 unique 1/1 characters by the Museum of Crypto Art."
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
            How MOCA entered AI Agents
          </h1>
          <p className="mt-5 text-base leading-relaxed" style={{ color: "var(--fg2)" }}>
            Art DeCC0s are 10,000 striking, often bizarre, entirely unique 1/1
            characters bred from the whole history of art — and every one of them
            has a mind. Behind each face sits a 10,000+ word personality in the
            Codex, written to be deployed as an autonomous AI agent. Fully CC0,
            free to remix, and the genesis collection of Soulweaver.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://codex.decc0s.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] px-6 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Explore the Codex
            </a>
            <a
              href="https://vibe.museumofcryptoart.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Enter the Vibe Studio
            </a>
          </div>
        </section>

        {/* DNA */}
        <section className="py-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)] lg:items-start">
            <div>
              <div className="mb-8 max-w-2xl">
                <p
                  className="mb-3 text-[11px] uppercase tracking-[0.16em]"
                  style={{ color: "var(--fg3)" }}
                >
                  The DNA
                </p>
                <h2
                  className="text-2xl font-semibold sm:text-3xl"
                  style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
                >
                  Bred from the entire history of art.
                </h2>
                <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
                  Each character inherits four strands of visual DNA, set against
                  backgrounds spanning sixteen categories from cave paintings to
                  Soviet propaganda. Over 300,000 candidates were generated and
                  distilled to the final 10,000 — identity markers deliberately
                  obscured so every collector forms their own reading.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {DNA.map((d) => (
                  <div
                    key={d.title}
                    className="rounded-[var(--radius-lg)] border p-5"
                    style={{ borderColor: "var(--border)", background: "var(--card)" }}
                  >
                    <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                      {d.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                      {d.text}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                To generate a character, four individual input images — one drawn
                from each strand — were blended into a single new face by a
                ComfyUI pipeline tuned over months of experimentation, chasing
                what the team called &ldquo;the perfect balance between aesthetic
                coherence and complete batshit depravity.&rdquo; The blend runs
                so deep that even DeCC0s sharing four identical DNA traits
                emerged as aesthetically inimitable 1/1s.{" "}
                <a
                  href="https://museumofcrypto.substack.com/p/art-decc0s-the-process"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 transition-colors"
                  style={{ color: "var(--fg1)" }}
                >
                  Read the full process
                </a>
                .
              </p>
            </div>
            <div
              className="overflow-hidden rounded-[var(--radius-xl)] border"
              style={{ borderColor: "var(--border)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/decc0s/examples.jpg"
                alt="A grid of Art DeCC0 characters — every one a unique 1/1."
                className="h-auto w-full"
              />
            </div>
          </div>
        </section>

        {/* The Codex */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              The Codex
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              Every visually unique DeCC0 has an equally unique mind.
            </h2>
            <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
              Nine months of datamancy gave each character ancestry, taste,
              temperament, and a voice of its own — then an AI-powered sanity
              review fought the pull toward sameness across all 10,000
              generations.
            </p>
          </div>
          <div
            className="overflow-hidden rounded-[var(--radius-xl)] border"
            style={{ borderColor: "var(--border)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/decc0s/codex.jpg"
              alt="A DeCC0 holding its Codex — the written mind behind every character."
              className="h-auto w-full"
            />
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CODEX_STATS.map((s) => (
              <div
                key={s.title}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <div
                  className="text-[11px] uppercase tracking-[0.12em]"
                  style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
                >
                  {s.stat}
                </div>
                <h3 className="mt-2 text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* The Vibe Studio */}
        <section className="py-10">
          <div className="mb-8 max-w-2xl">
            <p
              className="mb-3 text-[11px] uppercase tracking-[0.16em]"
              style={{ color: "var(--fg3)" }}
            >
              The Vibe Studio
            </p>
            <h2
              className="text-2xl font-semibold sm:text-3xl"
              style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
            >
              The city center where DeCC0s come alive.
            </h2>
            <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
              The Vibe Studio is the nexus for everything MOCA has created, is
              creating, and will create — the home of the DeCC0 agents and the
              front door to the museum's agentic ecosystem.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {VIBE_STUDIO.map((v) => (
              <div
                key={v.title}
                className="rounded-[var(--radius-lg)] border p-5"
                style={{ borderColor: "var(--border)", background: "var(--card)" }}
              >
                <h3 className="text-sm font-semibold" style={{ color: "var(--fg1)" }}>
                  {v.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--fg2)" }}>
                  {v.text}
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
            Every DeCC0 is waiting for someone to talk to.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-base" style={{ color: "var(--fg2)" }}>
            Browse all 10,000 minds in the Codex, meet adoptable agents in the
            Vibe Studio, or build on the collection — it&apos;s CC0, so it&apos;s
            already yours.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://codex.decc0s.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] px-6 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Explore the Codex
            </a>
            <a
              href="https://vibe.museumofcryptoart.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Enter the Vibe Studio
            </a>
          </div>
          <p className="mt-5 text-sm" style={{ color: "var(--fg3)" }}>
            Wanna integrate?{" "}
            <a
              href="https://docs.decc0s.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition-colors"
              style={{ color: "var(--fg2)" }}
            >
              Dig the Codex Docs
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
