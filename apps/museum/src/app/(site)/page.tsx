import Link from "next/link";
import type { Metadata } from "next";
import { listTopCollections, listCollectionPreviews } from "@/lib/museum/directus";
import { pickDisplayMedia, pickPreviewMedia, preferOriginalStill } from "@/lib/museum/media";
import CollectionCard from "@/components/museum/CollectionCard";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Museum of Crypto Art",
  description:
    "A community museum for crypto art and Web3 culture. Explore the collections, walk the exhibitions, and enter the Library to query the MOCA Cortex.",
  path: "/",
  absoluteTitle: true,
});

const MODES = [
  {
    href: "/collections",
    title: "Collections",
    desc: "Browse the permanent collection — genesis works and the artists who shaped crypto art.",
  },
  {
    href: "/rooms",
    title: "MOCA ROOMs",
    desc: "Step inside immersive 3D rooms built to hold the collection in space.",
  },
  {
    href: "/library",
    title: "Library",
    desc: "Study and curate the past while querying the present. Learn about crypto art, the collection, and Web3 culture. Powered by Cortex.",
  },
];

export default async function HomePage() {
  const collections = await listTopCollections();
  const featured = collections.slice(0, 6);
  const previewSets = await Promise.all(
    featured.map(async (c) => {
      const slugs = [c.slug, ...(c.child_collections || []).map((cc) => cc.slug)];
      const nfts = await listCollectionPreviews(slugs, 12);
      // Prefer a still poster so video works don't autoplay in the overview.
      return nfts.map((n) =>
        preferOriginalStill(pickPreviewMedia(n) ?? pickDisplayMedia(n), n.response_opensea)
      );
    })
  );

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* soft radial glow — depth, never a hard gradient */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-10%] h-[520px] w-[820px] -translate-x-1/2 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklch, var(--accent) 14%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-5 py-24 text-center sm:py-32 sm:px-8">
          <p
            className="mb-5 text-[11px] uppercase tracking-[0.18em]"
            style={{ color: "var(--fg3)" }}
          >
            Museum of Crypto Art
          </p>
          <h1
            className="text-balance text-4xl font-semibold leading-[1.05] sm:text-6xl"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            Where the community studies the past and queries the present.
          </h1>
          <p
            className="mx-auto mt-6 max-w-xl text-base sm:text-lg"
            style={{ color: "var(--fg2)" }}
          >
            Explore the collections, walk the exhibitions, and enter the Library —
            a living knowledge graph of crypto art, powered by the MOCA Cortex.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/library"
              className="flex h-11 items-center rounded-[var(--radius)] px-6 text-sm font-medium transition-transform active:scale-[0.98]"
              style={{ background: "var(--accent)", color: "var(--accent-fg)" }}
            >
              Enter the Library
            </Link>
            <Link
              href="/collections"
              className="flex h-11 items-center rounded-[var(--radius)] border px-6 text-sm font-medium transition-colors"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Explore the collections →
            </Link>
          </div>
        </div>
      </section>

      {/* Featured collections */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-7xl px-5 pb-8 sm:px-8">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-sm uppercase tracking-[0.12em]" style={{ color: "var(--fg3)" }}>
              Featured collections
            </h2>
            <Link href="/collections" className="text-sm" style={{ color: "var(--fg2)" }}>
              All collections →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((c, i) => (
              <CollectionCard
                key={c.id}
                href={`/collections/${c.slug}`}
                title={c.title || c.name}
                description={c.description}
                previews={previewSets[i]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Mission */}
      <section className="mx-auto max-w-3xl px-5 py-16 text-center sm:px-8">
        <p className="mb-4 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          Our mission
        </p>
        <p className="text-2xl font-medium leading-snug sm:text-3xl" style={{ color: "var(--fg1)", letterSpacing: "-0.01em" }}>
          We exist to preserve the truth. In a world that asks{" "}
          <span style={{ color: "var(--accent)" }}>“what is art?”</span> and{" "}
          <span style={{ color: "var(--accent)" }}>“who decides?”</span>, the
          Museum of Crypto Art decentralizes the answer — curated by the
          community, owned by no one, kept forever.
        </p>
      </section>

      {/* Three modes */}
      <section className="mx-auto max-w-7xl px-5 py-14 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {MODES.map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className="group rounded-[var(--radius-xl)] border p-6 transition-colors"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div className="flex items-center justify-between text-lg font-medium" style={{ color: "var(--fg1)" }}>
                {m.title}
                <span className="transition-transform group-hover:translate-x-1" style={{ color: "var(--accent)" }} aria-hidden>
                  →
                </span>
              </div>
              <p className="mt-2 text-sm" style={{ color: "var(--fg2)" }}>
                {m.desc}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
