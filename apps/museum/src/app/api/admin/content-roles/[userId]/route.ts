import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiKeys, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { deleteBackendKey } from "@/lib/backend";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ userId: string }>;
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId } = await ctx.params;
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !user.contentKeyId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const key = db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.id, user.contentKeyId))
    .get();

  db.update(users)
    .set({ contentKeyId: null, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  if (key) {
    try {
      await deleteBackendKey(key.backendKeyId);
    } catch (err) {
      console.warn(
        "[content-roles.delete] backend key revoke failed:",
        err instanceof Error ? err.message : err
      );
    }
    db.delete(apiKeys).where(eq(apiKeys.id, key.id)).run();
  }

  return NextResponse.json({ ok: true });
}
