import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { chatMessages, chatSessions } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth/session";
import { newId } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

interface Ctx {
  params: Promise<{ id: string }>;
}

async function ownedSession(userId: string, id: string) {
  return db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)))
    .get();
}

export async function GET(_: Request, ctx: Ctx) {
  const { user } = await requireAuth();
  const { id } = await ctx.params;
  const session = await ownedSession(user.id, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const messages = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.chatSessionId, id))
    .orderBy(asc(chatMessages.createdAt))
    .all();
  return NextResponse.json({
    id: session.id,
    title: session.title,
    memory: session.memory ? safeParse(session.memory) : undefined,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: messages.map((m) => {
      const meta = safeParse(m.metadata);
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        ...meta,
      };
    }),
  });
}

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  sources: z.unknown().optional(),
  graphContext: z.unknown().optional(),
  thinking: z.unknown().optional(),
  subQuestions: z.unknown().optional(),
  retrieval: z.unknown().optional(),
  retrievalStats: z.unknown().optional(),
  isStreaming: z.boolean().optional(),
});

const PatchBody = z.object({
  title: z.string().max(200).optional(),
  messages: z.array(MessageSchema).optional(),
  // Opaque memory blob — stored verbatim as a JSON string, never inspected.
  memory: z.unknown().optional(),
});

export async function PATCH(request: Request, ctx: Ctx) {
  const { user } = await requireAuth();
  const { id } = await ctx.params;
  const session = await ownedSession(user.id, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = PatchBody.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (parsed.data.title !== undefined) {
    db.update(chatSessions)
      .set({ title: parsed.data.title, updatedAt: Date.now() })
      .where(eq(chatSessions.id, id))
      .run();
  }

  // Opaque memory blob is stored as a JSON string; absent key = leave as-is.
  const hasMemory = parsed.data.memory !== undefined;
  const memoryValue = hasMemory ? JSON.stringify(parsed.data.memory) : null;

  if (parsed.data.messages) {
    // Replace all messages for this session in a transaction. Fold the memory
    // update in so a settled turn (messages + new memory) persists atomically.
    const now = Date.now();
    const msgs = parsed.data.messages;
    db.transaction((tx) => {
      tx.delete(chatMessages).where(eq(chatMessages.chatSessionId, id)).run();
      let i = 0;
      for (const m of msgs) {
        const { id: _id, role, content, isStreaming: _s, ...rest } = m;
        tx.insert(chatMessages)
          .values({
            id: _id || newId(),
            chatSessionId: id,
            role,
            content,
            metadata: JSON.stringify(rest),
            // Preserve ordering even if Date.now() returns the same ms.
            createdAt: now + i,
          })
          .run();
        i++;
      }
      tx.update(chatSessions)
        .set(hasMemory ? { updatedAt: now, memory: memoryValue } : { updatedAt: now })
        .where(eq(chatSessions.id, id))
        .run();
    });
  } else if (hasMemory) {
    db.update(chatSessions)
      .set({ memory: memoryValue, updatedAt: Date.now() })
      .where(eq(chatSessions.id, id))
      .run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, ctx: Ctx) {
  const { user } = await requireAuth();
  const { id } = await ctx.params;
  const session = await ownedSession(user.id, id);
  if (!session) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  db.delete(chatSessions).where(eq(chatSessions.id, id)).run();
  return NextResponse.json({ ok: true });
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
