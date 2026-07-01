import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getHoldings } from "@/lib/web3/holdings";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

/**
 * Account view data source: a connected wallet's MOCA-ecosystem holdings
 * ($MOCA ERC-20 balance on Ethereum + Polygon, plus Art DeCC0s and MOCA ROOMs
 * NFTs), read server-side so RPC/Moralis keys never reach the browser.
 */
export async function GET(req: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid 0x… address" },
      { status: 400 },
    );
  }

  try {
    const holdings = await getHoldings(parsed.data.address);
    return NextResponse.json(holdings);
  } catch {
    return NextResponse.json(
      { error: "Could not read on-chain holdings" },
      { status: 502 },
    );
  }
}
