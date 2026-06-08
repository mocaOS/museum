import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { chatSessions } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { newId } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const { user } = await requireAuth();
  const rows = db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.userId, user.id))
    .orderBy(desc(chatSessions.updatedAt))
    .all();
  return NextResponse.json({ sessions: rows });
}

const Body = z.object({
  id: z.string().min(1).optional(),
  title: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const { user } = await requireAuth();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const id = parsed.data.id || newId();
  const now = Date.now();
  db.insert(chatSessions)
    .values({
      id,
      userId: user.id,
      title: parsed.data.title ?? "",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return NextResponse.json({
    id,
    title: parsed.data.title ?? "",
    createdAt: now,
    updatedAt: now,
  });
}
