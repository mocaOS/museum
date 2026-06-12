import Link from "next/link";
import type { Metadata } from "next";
import { listTopCollections, listCollectionPreviews, listRooms, assetUrl } from "@/lib/museum/directus";
import { pickDisplayMedia, pickPreviewMedia, preferOriginalStill } from "@/lib/museum/media";
import CollectionCard from "@/components/museum/CollectionCard";
import CardCarousel from "@/components/museum/CardCarousel";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Museum of Crypto Art",
  description:
    "A community museum for crypto art and Web3 culture. Explore the collections, walk the exhibitions, and enter the Library to query the MOCA Cortex.",
  path: "/",
  absoluteTitle: true,
});

// The universe rail under the hero — one card per main-nav product. The
// DeCC0s card uses the character grid (its hero is a 3.5:1 banner that
// crops badly); the ROOMs card image is resolved from the room catalog.
const PRODUCTS = [
  {
    href: "/decc0s",
    title: "Art DeCC0s",
    desc: "10,000 unique 1/1 characters bred from the entire history of art. Fully CC0.",
    image: "/decc0s/examples.jpg",
  },
  {
    href: "/soulweaver",
    title: "Soulweaver",
    desc: "Awaken your NFTs — AI personality synthesis, portable SOUL.md identities.",
    image: "/soulweaver/hero.jpg",
  },
  {
    href: "/cortex",
    title: "Cortex",
    desc: "The memory layer for AI agents — documents become a living knowledge graph.",
    image: "/cortex/hero.jpg",
  },
  {
    href: "/rooms",
    title: "MOCA ROOMs",
    desc: "Immersive 3D rooms built to hold the collection in space.",
    image: null as string | null,
  },
];

export default async function HomePage() {
  const collections = await listTopCollections();
  // The featured rail is a horizontal slider, so it can hold more than the
  // old 2×3 grid did.
  const featured = collections.slice(0, 12);

  // ROOMs card cover: first room in the catalog that has a poster still.
  let roomsImage: string | null = null;
  try {
    const rooms = await listRooms();
    const cover = rooms.find((r) => r.image);
    if (cover?.image) {
      roomsImage = assetUrl(cover.image, { width: 1200, quality: 80, format: "webp" });
    }
  } catch {
    // catalog unreachable — the card falls back to its title placeholder
  }
  const products = PRODUCTS.map((p) =>
    p.href === "/rooms" ? { ...p, image: roomsImage } : p
  );
  // Slug set per featured collection (parent + children) — used both for the
  // initial preview batch and by the card's shuffle button to pull random
  // pieces from across the entire collection.
  const featuredSlugs = featured.map((c) => [
    c.slug,
    ...(c.child_collections || []).map((cc) => cc.slug),
  ]);
  const previewSets = await Promise.all(
    featuredSlugs.map(async (slugs) => {
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
            Explore the collections, walk our ROOMs, and enter the Library —
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

      {/* The MOCA universe — one card per main-nav product */}
      <section className="mx-auto max-w-7xl px-5 pb-14 sm:px-8">
        <h2 className="mb-5 text-sm uppercase tracking-[0.12em]" style={{ color: "var(--fg3)" }}>
          The MOCA universe
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group overflow-hidden rounded-[var(--radius-xl)] border transition-transform duration-200 hover:-translate-y-1"
              style={{ borderColor: "var(--border)", background: "var(--card)" }}
            >
              <div className="aspect-[16/10] overflow-hidden" style={{ background: "var(--muted)" }}>
                {p.image ? (
                  <img
                    src={p.image}
                    alt={p.title}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--fg3)" }}>
                    {p.title}
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center justify-between text-base font-medium" style={{ color: "var(--fg1)" }}>
                  {p.title}
                  <span className="transition-transform group-hover:translate-x-1" style={{ color: "var(--accent)" }} aria-hidden>
                    →
                  </span>
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm" style={{ color: "var(--fg2)" }}>
                  {p.desc}
                </p>
              </div>
            </Link>
          ))}
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
          <CardCarousel>
            {featured.map((c, i) => (
              <CollectionCard
                key={c.id}
                href={`/collections/${c.slug}`}
                title={c.title || c.name}
                previews={previewSets[i]}
                slugs={featuredSlugs[i]}
              />
            ))}
          </CardCarousel>
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

    </>
  );
}
