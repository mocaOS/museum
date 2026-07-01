import { NextResponse } from "next/server";
import { clearSession } from "@/lib/web3/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Drop the SIWE session cookie. The wallet stays connected (client-side). */
export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
