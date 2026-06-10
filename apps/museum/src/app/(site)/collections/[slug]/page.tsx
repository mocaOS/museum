import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getCollection,
  listTopCollections,
  countNfts,
  listNfts,
  NFTS_PER_PAGE,
} from "@/lib/museum/directus";
import { toNftView, pickPreviewMedia, pickDisplayMedia, preferOriginalStill } from "@/lib/museum/media";
import GalleryControls from "@/components/museum/GalleryControls";
import GalleryGrid from "@/components/museum/GalleryGrid";
import Pager from "@/components/museum/Pager";
import EssayDrawer from "@/components/museum/EssayDrawer";
import JsonLd from "@/components/seo/JsonLd";
import { breadcrumbLd, collectionPageLd } from "@/lib/seo";

// NFT reads (list + count) are cached hourly in the data layer
// (lib/museum/directus.ts), so the CMS isn't hit per request even though the
// route renders dynamically (root layout is force-dynamic for runtime branding
// env). The revalidate + generateStaticParams below let Next prerender each
// collection's base slug as static ISR if that root constraint is ever lifted.
export const revalidate = 3600;

export async function generateStaticParams() {
  const collections = await listTopCollections();
  return collections.map((c) => ({ slug: c.slug }));
}

type SearchParams = Promise<{ page?: string; search?: string; sub?: string }>;
type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollection(slug);
  if (!collection) return { title: "Gallery" };
  const title = collection.title || collection.name;
  const description =
    collection.description ??
    `Browse "${title}" — part of the Museum of Crypto Art permanent collection.`;
  const canonical = `/collections/${slug}`;

  // Social/answer-engine card: lead with an actual work from the collection
  // (still poster, original-quality) instead of the generic site card.
  let ogImage = "/social.jpg";
  try {
    // Include child-collection slugs — some parents hold no works directly.
    const slugs = [slug, ...(collection.child_collections ?? []).map((c) => c.slug)];
    const [first] = await listNfts({ slugs, page: 1 });
    if (first) {
      const media = preferOriginalStill(
        pickPreviewMedia(first) ?? pickDisplayMedia(first),
        first.response_opensea
      );
      if (media?.url) ogImage = media.url;
    }
  } catch {
    // keep the site-wide /social.jpg fallback
  }

  return {
    title,
    description,
    // Canonicalize paginated/filtered variants (?page, ?search) to the base slug.
    alternates: { canonical },
    // Page-level openGraph/twitter REPLACE the layout's (shallow merge), so an
    // image must always be present here.
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      images: [ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const collection = await getCollection(slug);
  if (!collection) notFound();

  const page = Math.max(1, Number(sp.page) || 1);
  const search = sp.search?.trim() || "";
  const sub = sp.sub || "all";

  const childOptions = (collection.child_collections || []).map((c) => ({
    slug: c.slug,
    name: c.name,
  }));
  const allSlugs = [collection.slug, ...childOptions.map((c) => c.slug)];
  const slugs = sub !== "all" ? [sub] : allSlugs;

  const [total, nfts] = await Promise.all([
    countNfts(slugs, search),
    listNfts({ slugs, page, search }),
  ]);
  const totalPages = Math.ceil(total / NFTS_PER_PAGE);

  // Resolve media (and revive dead OpenSea URLs) on the server so the heavy
  // `response_opensea` blob and raw media columns never reach the browser —
  // the client only receives the two small resolved MediaInfo objects per work.
  const views = nfts.map(toNftView);

  const collectionName = collection.title || collection.name;
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <JsonLd
        data={breadcrumbLd([
          { name: "Collections", path: "/collections" },
          { name: collectionName, path: `/collections/${slug}` },
        ])}
      />
      <JsonLd
        data={collectionPageLd({
          name: collectionName,
          description: collection.description,
          path: `/collections/${slug}`,
          artworks: views.map((v) => ({
            name: v.name,
            artistName: v.artist_name,
            imageUrl: v.preview?.url ?? v.display?.url,
          })),
        })}
      />
      <nav className="mb-6 text-xs" style={{ color: "var(--fg3)" }}>
        <Link href="/collections" className="hover:underline">
          Collections
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--fg2)" }}>{collection.name}</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1
            className="text-3xl font-semibold sm:text-4xl"
            style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}
          >
            {collection.title || collection.name}
          </h1>
          {collection.description && (
            <p className="mt-3 text-base" style={{ color: "var(--fg2)" }}>
              {collection.description}
            </p>
          )}
        </div>
        {collection.essay && <EssayDrawer essay={collection.essay} />}
      </div>

      <GalleryControls
        total={total}
        options={childOptions}
        selectedSub={sub}
        search={search}
      />

      <GalleryGrid
        nfts={views}
        emptyMessage={
          search
            ? `No artworks matching “${search}”.`
            : "No artworks in this collection yet."
        }
      />

      <Pager page={page} totalPages={totalPages} />
    </div>
  );
}
