import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { sessions, users } from "@/lib/db/schema";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/cookie";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function PATCH(request: Request) {
  const { user } = await requireAuth();
  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Passwords must be at least 8 characters." },
      { status: 400 }
    );
  }

  const ok = await verifyPassword(user.passwordHash, parsed.data.currentPassword);
  if (!ok) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 401 }
    );
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  db.update(users)
    .set({ passwordHash: newHash, updatedAt: Date.now() })
    .where(eq(users.id, user.id))
    .run();

  // Invalidate OTHER sessions for this user but keep the current one.
  const jar = await cookies();
  const currentToken = jar.get(SESSION_COOKIE)?.value ?? "";
  db.delete(sessions)
    .where(and(eq(sessions.userId, user.id), ne(sessions.token, currentToken)))
    .run();

  return NextResponse.json({ ok: true });
}
