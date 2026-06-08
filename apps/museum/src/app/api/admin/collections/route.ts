import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { listBackendCollections } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const collections = await listBackendCollections();
    return NextResponse.json({ collections });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backend error" },
      { status: 502 }
    );
  }
}
