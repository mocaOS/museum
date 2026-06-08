import { NextResponse } from "next/server";
import { asc, eq, gte, sql, type AnyColumn } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { loginEvents, usageEvents, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

interface DayRow {
  day: string;
  n: number;
}

interface UserCount {
  userId: string | null;
  email: string | null;
  username: string | null;
  lastLoginAt: number | null;
  n: number;
  logins?: number;
}

function dayExpr(col: AnyColumn) {
  // SQLite: convert ms → date string (UTC).
  return sql<string>`date(${col} / 1000, 'unixepoch')`;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1),
    180
  );
  const since = Date.now() - days * 24 * 60 * 60 * 1000;

  const loginSeries = db
    .select({
      day: dayExpr(loginEvents.createdAt).as("day"),
      n: sql<number>`count(*)`.as("n"),
    })
    .from(loginEvents)
    .where(
      sql`${loginEvents.createdAt} >= ${since} AND ${loginEvents.success} = 1`
    )
    .groupBy(sql`day`)
    .orderBy(asc(sql`day`))
    .all() as DayRow[];

  const seriesByKind = (kind: "message" | "upload"): DayRow[] => {
    return db
      .select({
        day: dayExpr(usageEvents.createdAt).as("day"),
        n: sql<number>`count(*)`.as("n"),
      })
      .from(usageEvents)
      .where(sql`${usageEvents.createdAt} >= ${since} AND ${usageEvents.kind} = ${kind}`)
      .groupBy(sql`day`)
      .orderBy(asc(sql`day`))
      .all() as DayRow[];
  };

  const messageSeries = seriesByKind("message");
  const uploadSeries = seriesByKind("upload");

  const perUser = db
    .select({
      userId: usageEvents.userId,
      email: users.email,
      username: users.username,
      lastLoginAt: users.lastLoginAt,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(usageEvents)
    .leftJoin(users, eq(users.id, usageEvents.userId))
    .where(
      sql`${usageEvents.createdAt} >= ${since} AND ${usageEvents.kind} = 'message'`
    )
    .groupBy(usageEvents.userId, users.email, users.username, users.lastLoginAt)
    .orderBy(sql`count(*) desc`)
    .limit(10)
    .all() as UserCount[];

  // Count successful logins per user within the same window, then enrich.
  const loginCounts = db
    .select({
      userId: loginEvents.userId,
      n: sql<number>`count(*)`.as("n"),
    })
    .from(loginEvents)
    .where(
      sql`${loginEvents.createdAt} >= ${since} AND ${loginEvents.success} = 1`
    )
    .groupBy(loginEvents.userId)
    .all() as { userId: string | null; n: number }[];
  const loginMap = new Map(loginCounts.map((r) => [r.userId, r.n]));
  for (const u of perUser) {
    u.logins = loginMap.get(u.userId) ?? 0;
  }

  // Merge all three series onto a shared day axis so charts can share x-ticks.
  const merged = mergeSeries({
    logins: loginSeries,
    messages: messageSeries,
    uploads: uploadSeries,
  });

  return NextResponse.json({
    days,
    totals: {
      logins: totalN(loginSeries),
      messages: totalN(messageSeries),
      uploads: totalN(uploadSeries),
      activeUsers: await distinctUsers(since),
    },
    series: merged,
    topUsers: perUser,
  });
}

function totalN(rows: DayRow[]): number {
  return rows.reduce((a, b) => a + b.n, 0);
}

async function distinctUsers(since: number): Promise<number> {
  const row = db
    .select({
      n: sql<number>`count(distinct ${usageEvents.userId})`,
    })
    .from(usageEvents)
    .where(gte(usageEvents.createdAt, since))
    .get();
  return row?.n ?? 0;
}

function mergeSeries(input: Record<string, DayRow[]>) {
  const keys = Object.keys(input);
  const days = new Set<string>();
  for (const rows of Object.values(input)) {
    for (const r of rows) days.add(r.day);
  }
  const sorted = Array.from(days).sort();
  return sorted.map((day) => {
    const point: Record<string, string | number> = { day };
    for (const k of keys) {
      const hit = input[k].find((r) => r.day === day);
      point[k] = hit?.n ?? 0;
    }
    return point;
  });
}
