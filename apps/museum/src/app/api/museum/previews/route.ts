import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { countNfts, listNfts } from "@/lib/museum/directus";
import {
  pickDisplayMedia,
  pickPreviewMedia,
  preferOriginalStill,
  type MediaInfo,
} from "@/lib/museum/media";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  // Comma-separated collection slugs (a parent + its children).
  slugs: z.string().min(1),
  count: z.coerce.number().int().min(1).max(24).optional(),
});

/**
 * A random batch of still previews for a collection card's shuffle button.
 * The landing page only ships the first dozen works per collection; this
 * route samples a random page across the FULL collection so repeated
 * shuffles eventually span everything, not the same opening twelve.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }
  const { slugs: slugsRaw, count = 12 } = parsed.data;
  const slugs = slugsRaw.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const total = await countNfts(slugs);
    const pages = Math.max(1, Math.ceil(total / count));
    const page = 1 + Math.floor(Math.random() * pages);
    const nfts = await listNfts({ slugs, page, limit: count });
    const previews = nfts
      .map((n) =>
        preferOriginalStill(
          pickPreviewMedia(n) ?? pickDisplayMedia(n),
          n.response_opensea
        )
      )
      .filter(Boolean) as MediaInfo[];
    return NextResponse.json({ previews, total });
  } catch {
    return NextResponse.json({ previews: [], total: 0 });
  }
}
