import { NextResponse } from "next/server";
import { getSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Current SIWE session — drives conditional UI (submit access, admin review). */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({});
  return NextResponse.json({
    address: session.address,
    isAdmin: isLibraryAdmin(session.address),
  });
}
