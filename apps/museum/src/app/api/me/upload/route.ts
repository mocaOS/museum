import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { usageEvents } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { getUserContentKey } from "@/lib/auth/backend-key";
import { getBackendUrl } from "@/lib/backend";
import { newId } from "@/lib/auth/crypto";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow larger request bodies for uploads.
export const maxDuration = 120;

export async function POST(request: Request) {
  const { user } = await requireAuth();

  const resolved = getUserContentKey(user);
  if (!resolved) {
    return NextResponse.json(
      { error: "You do not have upload permission." },
      { status: 403 }
    );
  }

  let inForm: FormData;
  try {
    inForm = await request.formData();
  } catch (err) {
    console.error("[upload] formData parse failed:", err);
    return NextResponse.json(
      {
        error:
          "Could not read upload. The file may be too large or the request was truncated.",
      },
      { status: 400 }
    );
  }
  const file = inForm.get("file");
  const collectionId = (inForm.get("collection_id") as string | null) || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File is too large. Maximum size is ${MAX_UPLOAD_LABEL}.` },
      { status: 413 }
    );
  }

  // If the user's key is scoped, enforce the scope.
  if (
    collectionId &&
    resolved.collectionIds.length > 0 &&
    !resolved.collectionIds.includes(collectionId)
  ) {
    return NextResponse.json(
      { error: "This collection is outside your upload scope." },
      { status: 403 }
    );
  }

  const apiUrl = getBackendUrl();
  const outForm = new FormData();
  outForm.append("file", file, file.name);
  if (collectionId) outForm.append("collection_id", collectionId);

  try {
    const upstream = await fetch(`${apiUrl}/api/upload`, {
      method: "POST",
      headers: {
        "X-API-Key": resolved.apiKey,
      },
      body: outForm,
    });

    // Log the upload attempt regardless of outcome (with status).
    db.insert(usageEvents)
      .values({
        id: newId(),
        userId: user.id,
        kind: "upload",
        collectionId,
        metadata: JSON.stringify({
          filename: file.name,
          size: file.size,
          status: upstream.status,
        }),
      })
      .run();

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Upload rejected by Cortex (${upstream.status}): ${text.slice(0, 400)}`,
        },
        { status: upstream.status }
      );
    }

    // Return just a confirmation. We intentionally do NOT surface extraction
    // progress — the UX contract is "confirm upload received, nothing else".
    return NextResponse.json({
      ok: true,
      filename: file.name,
      collectionId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upstream error" },
      { status: 502 }
    );
  }
}
