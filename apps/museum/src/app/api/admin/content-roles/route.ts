import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { apiKeys, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { encryptSecret, newId } from "@/lib/auth/crypto";
import { createBackendKey, deleteBackendKey } from "@/lib/backend";

export const dynamic = "force-dynamic";

// A "content role" is the combination of users.content_key_id + its api_keys row.
// List: all users who currently have a content key assigned.
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = db
    .select({
      userId: users.id,
      email: users.email,
      username: users.username,
      keyId: apiKeys.id,
      backendKeyId: apiKeys.backendKeyId,
      collectionIds: apiKeys.collectionIds,
      label: apiKeys.label,
      createdAt: apiKeys.createdAt,
    })
    .from(users)
    .innerJoin(apiKeys, eq(apiKeys.id, users.contentKeyId))
    .orderBy(asc(users.email))
    .all();

  return NextResponse.json({
    roles: rows.map((r) => ({
      ...r,
      collectionIds: r.collectionIds ? JSON.parse(r.collectionIds) : [],
    })),
  });
}

const Body = z.object({
  userId: z.string().min(1),
  collectionIds: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { userId, collectionIds } = parsed.data;

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.role === "superadmin" || user.role === "admin") {
    return NextResponse.json(
      { error: "Admins and superadmin already have full upload access." },
      { status: 400 }
    );
  }

  // Mint a new backend key (permission=manage).
  let backendKey;
  try {
    backendKey = await createBackendKey({
      permission: "manage",
      collection_ids: collectionIds,
      label: `content-role:${user.email}`,
      name: `cortex-chat content:${user.email}`,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Cortex rejected key creation: ${err.message}`
            : "Backend error",
      },
      { status: 502 }
    );
  }

  // If the user already had a content key, revoke it first.
  const previousKeyId = user.contentKeyId;
  const newKeyId = newId();

  db.transaction((tx) => {
    tx.insert(apiKeys)
      .values({
        id: newKeyId,
        backendKeyId: backendKey.id,
        encryptedValue: encryptSecret(backendKey.key),
        permission: "manage",
        collectionIds: JSON.stringify(collectionIds),
        label: `content-role:${user.email}`,
      })
      .run();
    tx.update(users)
      .set({ contentKeyId: newKeyId, updatedAt: Date.now() })
      .where(eq(users.id, user.id))
      .run();
  });

  if (previousKeyId) {
    const old = db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, previousKeyId))
      .get();
    if (old) {
      try {
        await deleteBackendKey(old.backendKeyId);
      } catch (err) {
        console.warn(
          "[content-roles.create] revoking previous key failed:",
          err instanceof Error ? err.message : err
        );
      }
      db.delete(apiKeys).where(eq(apiKeys.id, old.id)).run();
    }
  }

  return NextResponse.json({
    userId: user.id,
    email: user.email,
    keyId: newKeyId,
    collectionIds,
  });
}
