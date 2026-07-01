import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStakePositions } from "@/lib/web3/stakes";
import type { StakesResponse } from "@/lib/web3/staking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const querySchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address"),
});

/**
 * A connected wallet's remaining stake in the legacy MOCA pools on Polygon
 * ($MOCA and MOCA/USDC + MOCA/WETH LP), read server-side so the RPC endpoint
 * never reaches the browser. The /unstake page fetches this to decide which
 * pools to surface a Withdraw button for. Read-only — the actual withdrawal is
 * a wallet transaction the user signs client-side.
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
    const positions = await getStakePositions(parsed.data.address);
    const body: StakesResponse = {
      address: parsed.data.address.toLowerCase(),
      positions,
    };
    return NextResponse.json(body);
  } catch {
    return NextResponse.json(
      { error: "Could not read staking positions" },
      { status: 502 },
    );
  }
}
