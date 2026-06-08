import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loginEvents, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500
  );
  const offset = Math.max(
    parseInt(url.searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  const rows = db
    .select({
      id: loginEvents.id,
      createdAt: loginEvents.createdAt,
      success: loginEvents.success,
      emailAttempted: loginEvents.emailAttempted,
      ip: loginEvents.ip,
      userAgent: loginEvents.userAgent,
      userEmail: users.email,
      username: users.username,
    })
    .from(loginEvents)
    .leftJoin(users, eq(loginEvents.userId, users.id))
    .orderBy(desc(loginEvents.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({ events: rows, limit, offset });
}
