import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchMultipassProfile, isEthAddress } from "@/lib/museum/multipass";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  address: z.string().refine(isEthAddress, "Invalid address"),
});

/**
 * Multipass importer: resolve a wallet's legacy MOCA curations (repertoires +
 * exhibitions) into a list of tabs the builder can browse and hang from. Reads
 * the public legacy Strapi backend server-side; the host is hardcoded (no SSRF
 * surface).
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid 0x… address" }, { status: 400 });
  }

  try {
    const profile = await fetchMultipassProfile(parsed.data.address);
    if (!profile) {
      return NextResponse.json(
        { error: "No Multipass profile found for that address" },
        { status: 404 },
      );
    }
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Could not reach the Multipass service" },
      { status: 502 },
    );
  }
}
