import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchMultipassItems } from "@/lib/museum/multipass";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  // Comma-separated legacy item ids (one page worth — capped server-side).
  ids: z.string().min(1),
});

/**
 * Resolve a page of legacy item ids (from a Multipass tab's `order`) into
 * media-resolved NftViews the builder can hang. Order is preserved.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const ids = parsed.data.ids
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .slice(0, 60);

  if (ids.length === 0) {
    return NextResponse.json({ artworks: [] });
  }

  try {
    const artworks = await fetchMultipassItems(ids);
    return NextResponse.json({ artworks });
  } catch {
    return NextResponse.json({ artworks: [] }, { status: 200 });
  }
}
