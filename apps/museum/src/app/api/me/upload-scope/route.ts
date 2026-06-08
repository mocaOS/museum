import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/session";
import { getUserContentKey } from "@/lib/auth/backend-key";
import { listBackendCollections } from "@/lib/backend";

export const dynamic = "force-dynamic";

// Returns the collections the current user is allowed to upload to.
// We use the BACKEND_ADMIN_API_KEY to list all collections, then filter by
// the user's content-key scope — this avoids exposing the admin key to the
// client while still giving users a useful name/description for each id.
export async function GET() {
  const { user } = await requireAuth();
  const resolved = getUserContentKey(user);
  if (!resolved) {
    return NextResponse.json(
      { error: "You do not have upload permission." },
      { status: 403 }
    );
  }

  let all;
  try {
    all = await listBackendCollections();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Backend error" },
      { status: 502 }
    );
  }

  const scoped =
    resolved.collectionIds.length === 0
      ? all
      : all.filter((c) => resolved.collectionIds.includes(c.id));

  return NextResponse.json({ collections: scoped });
}
