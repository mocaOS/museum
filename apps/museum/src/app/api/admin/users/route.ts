import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { groups, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { newId } from "@/lib/auth/crypto";
import { hashPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

export async function GET() {
  let viewerRole: "admin" | "superadmin";
  try {
    const { user } = await requireAdmin();
    viewerRole = user.role as "admin" | "superadmin";
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = db
    .select({
      id: users.id,
      email: users.email,
      username: users.username,
      role: users.role,
      groupId: users.groupId,
      groupName: groups.name,
      contentKeyId: users.contentKeyId,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .leftJoin(groups, eq(users.groupId, groups.id))
    .orderBy(asc(users.email))
    .all();

  return NextResponse.json({ users: rows, viewerRole });
}

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().max(80).optional(),
  groupId: z.string().nullable().optional(),
  role: z.enum(["user", "admin", "superadmin"]).optional(),
});

export async function POST(request: Request) {
  let callerRole: "admin" | "superadmin";
  try {
    const { user } = await requireAdmin();
    callerRole = user.role as "admin" | "superadmin";
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    );
  }
  const requestedRole = parsed.data.role ?? "user";

  if (requestedRole === "superadmin") {
    return NextResponse.json(
      {
        error:
          "Superadmin is bound to SUPERADMIN_EMAIL and cannot be created via the UI.",
      },
      { status: 400 }
    );
  }
  if (requestedRole === "admin" && callerRole !== "superadmin") {
    return NextResponse.json(
      { error: "Only the superadmin can create admin accounts." },
      { status: 403 }
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const existing = db.select().from(users).where(eq(users.email, email)).get();
  if (existing) {
    return NextResponse.json(
      { error: "A user with this email already exists." },
      { status: 409 }
    );
  }

  const id = newId();
  const passwordHash = await hashPassword(parsed.data.password);
  db.insert(users)
    .values({
      id,
      email,
      passwordHash,
      username: parsed.data.username ?? "",
      role: requestedRole,
      groupId: parsed.data.groupId ?? null,
    })
    .run();

  return NextResponse.json({
    id,
    email,
    username: parsed.data.username ?? "",
    role: requestedRole,
    groupId: parsed.data.groupId ?? null,
  });
}
