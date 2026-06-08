import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { groups } from "@/lib/db/schema";
import { getAuth } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const ctx = await getAuth();
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { user } = ctx;
  const group = user.groupId
    ? db.select().from(groups).where(eq(groups.id, user.groupId)).get()
    : null;

  return NextResponse.json({
    id: user.id,
    email: user.email,
    username: user.username,
    avatarUrl: user.avatarPath ? `/api/avatars/${user.id}` : null,
    role: user.role,
    group: group
      ? { id: group.id, name: group.name, description: group.description }
      : null,
    canUpload:
      user.role === "superadmin" ||
      user.role === "admin" ||
      !!user.contentKeyId,
  });
}
