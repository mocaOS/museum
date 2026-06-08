import { NextResponse } from "next/server";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { apiKeys, groups, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { newId } from "@/lib/auth/crypto";
import { encryptSecret } from "@/lib/auth/crypto";
import { createBackendKey } from "@/lib/backend";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = db
    .select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      chatKeyId: groups.chatKeyId,
      collectionIds: apiKeys.collectionIds,
      memberCount: sql<number>`(SELECT COUNT(*) FROM ${users} u WHERE u.group_id = ${groups.id})`,
      createdAt: groups.createdAt,
    })
    .from(groups)
    .leftJoin(apiKeys, eq(apiKeys.id, groups.chatKeyId))
    .orderBy(asc(groups.name))
    .all();

  return NextResponse.json({
    groups: rows.map((r) => ({
      ...r,
      collectionIds: r.collectionIds ? JSON.parse(r.collectionIds) : [],
    })),
  });
}

const Body = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
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
  const { name, description = "", collectionIds } = parsed.data;

  if (db.select().from(groups).where(eq(groups.name, name)).get()) {
    return NextResponse.json(
      { error: "A group with this name already exists." },
      { status: 409 }
    );
  }

  let backendKey;
  try {
    backendKey = await createBackendKey({
      permission: "read",
      collection_ids: collectionIds,
      label: `group:${name}`,
      name: `cortex-chat group:${name}`,
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

  const apiKeyId = newId();
  const groupId = newId();
  db.transaction((tx) => {
    tx.insert(apiKeys)
      .values({
        id: apiKeyId,
        backendKeyId: backendKey.id,
        encryptedValue: encryptSecret(backendKey.key),
        permission: "read",
        collectionIds: JSON.stringify(collectionIds),
        label: `group:${name}`,
      })
      .run();
    tx.insert(groups)
      .values({
        id: groupId,
        name,
        description,
        chatKeyId: apiKeyId,
      })
      .run();
  });

  return NextResponse.json({
    id: groupId,
    name,
    description,
    collectionIds,
    memberCount: 0,
  });
}
