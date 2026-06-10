import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listNfts,
  countNfts,
  listTopCollections,
  NFTS_PER_PAGE,
} from "@/lib/museum/directus";
import { toNftView } from "@/lib/museum/media";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const querySchema = z.object({
  // Comma-separated collection slugs to scope the search. Empty = all.
  slugs: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).max(500).optional(),
});

// Resolve "all collections" to the full set of published slugs (parents +
// children) so an unscoped search spans the entire museum. Cached upstream.
async function allSlugs(): Promise<string[]> {
  const tops = await listTopCollections();
  const slugs = new Set<string>();
  for (const c of tops) {
    slugs.add(c.slug);
    for (const child of c.child_collections || []) slugs.add(child.slug);
  }
  return [...slugs];
}

/**
 * Client-callable artwork search for the exhibition builder. Mirrors the
 * server gallery fetchers (listNfts/countNfts) but returns lightweight,
 * media-resolved NftViews (incl. aspect ratio) over JSON so the in-canvas
 * picker can browse/search within or across collections.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { slugs: slugsRaw, search, page = 1 } = parsed.data;

  try {
    const slugs = slugsRaw
      ? slugsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : await allSlugs();

    if (slugs.length === 0) {
      return NextResponse.json({ artworks: [], total: 0, page, perPage: NFTS_PER_PAGE });
    }

    const [total, nfts] = await Promise.all([
      countNfts(slugs, search),
      listNfts({ slugs, page, search }),
    ]);

    return NextResponse.json({
      artworks: nfts.map(toNftView),
      total,
      page,
      perPage: NFTS_PER_PAGE,
    });
  } catch {
    return NextResponse.json(
      { artworks: [], total: 0, page, perPage: NFTS_PER_PAGE },
      { status: 200 }
    );
  }
}
