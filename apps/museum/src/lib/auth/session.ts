import "server-only";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type Session, type User } from "@/lib/db/schema";
import { newSessionToken } from "./crypto";
import { SESSION_COOKIE, SESSION_TTL_MS } from "./cookie";

export { SESSION_COOKIE };

export interface AuthContext {
  session: Session;
  user: User;
}

export async function createSession(
  userId: string,
  meta: { ip?: string; userAgent?: string } = {}
): Promise<string> {
  const token = newSessionToken();
  const now = Date.now();
  db.insert(sessions)
    .values({
      token,
      userId,
      ip: meta.ip ?? "",
      userAgent: meta.userAgent ?? "",
      createdAt: now,
      lastSeenAt: now,
      expiresAt: now + SESSION_TTL_MS,
    })
    .run();
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    db.delete(sessions).where(eq(sessions.token, token)).run();
  }
  jar.delete(SESSION_COOKIE);
}

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .get();

  if (!row) return null;
  const { sessions: session, users: user } = row;

  if (session.expiresAt < Date.now()) {
    db.delete(sessions).where(eq(sessions.token, token)).run();
    return null;
  }

  // Touch last_seen once per minute at most.
  if (Date.now() - session.lastSeenAt > 60_000) {
    db.update(sessions)
      .set({ lastSeenAt: Date.now() })
      .where(eq(sessions.token, token))
      .run();
  }

  return { session, user };
}

export async function requireAuth(): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) throw new AuthError("Unauthorized", 401);
  return ctx;
}

export async function requireSuperadmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.user.role !== "superadmin") {
    throw new AuthError("Forbidden", 403);
  }
  return ctx;
}

export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.user.role !== "admin" && ctx.user.role !== "superadmin") {
    throw new AuthError("Forbidden", 403);
  }
  return ctx;
}

export class AuthError extends Error {
  constructor(message: string, public status: 401 | 403) {
    super(message);
    this.name = "AuthError";
  }
}

export async function getRequestMeta(): Promise<{
  ip: string;
  userAgent: string;
}> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  const ip =
    (forwarded && forwarded.split(",")[0].trim()) ||
    h.get("x-real-ip") ||
    "";
  return { ip, userAgent: h.get("user-agent") || "" };
}
