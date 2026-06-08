import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { apiKeys, groups } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import {
  deleteBackendKey,
  updateBackendKey,
} from "@/lib/backend";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(500).optional(),
  collectionIds: z.array(z.string()).optional(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;

  const group = db.select().from(groups).where(eq(groups.id, id)).get();
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Collection-scope change → update the upstream key via PATCH.
  if (parsed.data.collectionIds && group.chatKeyId) {
    const key = db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, group.chatKeyId))
      .get();
    if (key) {
      try {
        await updateBackendKey(key.backendKeyId, {
          collection_ids: parsed.data.collectionIds,
        });
      } catch (err) {
        return NextResponse.json(
          {
            error:
              err instanceof Error
                ? `Cortex rejected scope update: ${err.message}`
                : "Backend error",
          },
          { status: 502 }
        );
      }
      db.update(apiKeys)
        .set({
          collectionIds: JSON.stringify(parsed.data.collectionIds),
        })
        .where(eq(apiKeys.id, key.id))
        .run();
    }
  }

  const patch: Partial<typeof groups.$inferInsert> = {
    updatedAt: Date.now(),
  };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.description !== undefined)
    patch.description = parsed.data.description;
  db.update(groups).set(patch).where(eq(groups.id, id)).run();

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, ctx: Ctx) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const group = db.select().from(groups).where(eq(groups.id, id)).get();
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (group.chatKeyId) {
    const key = db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.id, group.chatKeyId))
      .get();
    if (key) {
      try {
        await deleteBackendKey(key.backendKeyId);
      } catch (err) {
        // Continue with local cleanup even if backend revoke fails,
        // but surface the warning so operators can audit.
        console.warn(
          "[groups.delete] backend key revoke failed:",
          err instanceof Error ? err.message : err
        );
      }
      db.delete(apiKeys).where(eq(apiKeys.id, key.id)).run();
    }
  }

  db.delete(groups).where(eq(groups.id, id)).run();
  return NextResponse.json({ ok: true });
}
