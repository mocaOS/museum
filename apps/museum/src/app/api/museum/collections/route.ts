import { NextResponse } from "next/server";
import { listTopCollections } from "@/lib/museum/directus";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export interface CollectionOption {
  /** Slug used to filter artworks (a parent or child collection). */
  slug: string;
  name: string;
  /** Slugs to query for this option (self + children for a parent). */
  slugs: string[];
  /** Indentation level for the picker dropdown (0 = parent, 1 = child). */
  depth: number;
}

/**
 * Flattened list of published collections for the exhibition builder's artwork
 * picker. Parents come with their child collections inlined (depth 1) so a
 * curator can scope a search to a whole top collection or one sub-collection.
 */
export async function GET() {
  try {
    const tops = await listTopCollections();
    const options: CollectionOption[] = [];
    for (const c of tops) {
      const children = c.child_collections || [];
      const childSlugs = children.map((x) => x.slug);
      options.push({
        slug: c.slug,
        name: c.title || c.name,
        slugs: [c.slug, ...childSlugs],
        depth: 0,
      });
      for (const child of children) {
        options.push({
          slug: child.slug,
          name: child.name,
          slugs: [child.slug],
          depth: 1,
        });
      }
    }
    return NextResponse.json({ collections: options });
  } catch {
    return NextResponse.json({ collections: [] }, { status: 200 });
  }
}
