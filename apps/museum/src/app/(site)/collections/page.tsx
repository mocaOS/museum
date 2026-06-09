import type { Metadata } from "next";
import { listTopCollections, listCollectionPreviews } from "@/lib/museum/directus";
import { pickDisplayMedia, pickPreviewMedia } from "@/lib/museum/media";
import CollectionCard from "@/components/museum/CollectionCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Explore the MOCA permanent collection — genesis works, curated collections, and the artists who shaped crypto art.",
};

export default async function CollectionsPage() {
  const collections = await listTopCollections();

  // A batch of candidate pieces per collection so each cover can be randomized
  // and shuffled by the visitor.
  const previewSets = await Promise.all(
    collections.map(async (c) => {
      const slugs = [c.slug, ...(c.child_collections || []).map((cc) => cc.slug)];
      const nfts = await listCollectionPreviews(slugs, 12);
      // Prefer a still poster so video works don't autoplay in the overview.
      return nfts.map((n) => pickPreviewMedia(n) ?? pickDisplayMedia(n));
    })
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-12 sm:px-8">
      <header className="mb-10 max-w-2xl">
        <p className="mb-3 text-[11px] uppercase tracking-[0.16em]" style={{ color: "var(--fg3)" }}>
          The collection
        </p>
        <h1 className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--fg1)", letterSpacing: "-0.02em" }}>
          Collections
        </h1>
        <p className="mt-4 text-base" style={{ color: "var(--fg2)" }}>
          Walk the permanent collection — from the genesis works to the curated
          collections that map the history of crypto art.
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c, i) => (
          <CollectionCard
            key={c.id}
            href={`/collections/${c.slug}`}
            title={c.title || c.name}
            description={c.description}
            previews={previewSets[i]}
          />
        ))}
      </div>
    </div>
  );
}
