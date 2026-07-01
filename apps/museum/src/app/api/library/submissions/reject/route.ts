import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";
import {
  submissionsConfigured,
  getSubmission,
  updateSubmission,
} from "@/lib/library/submissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Ids may be UUID strings or numeric (integer PK) — accept both, coerce to string.
const bodySchema = z.object({
  ids: z
    .array(z.union([z.string().min(1), z.number().int()]))
    .min(1)
    .max(100)
    .transform((arr) => arr.map(String)),
  reason: z.string().max(500).optional(),
});

interface ItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

/** Reject selected submissions (keeps the row for audit). Admin only. */
export async function POST(req: NextRequest) {
  if (!submissionsConfigured()) {
    return NextResponse.json(
      { error: "Submissions are not configured" },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isLibraryAdmin(session.address)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const results: ItemResult[] = [];
  const now = new Date().toISOString();

  for (const id of parsed.data.ids) {
    try {
      const sub = await getSubmission(id);
      if (!sub) {
        results.push({ id, ok: false, error: "Not found" });
        continue;
      }
      await updateSubmission(id, {
        status: "rejected",
        rejected_reason: parsed.data.reason || null,
        reviewed_by: session.address,
        reviewed_at: now,
      });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Rejection failed",
      });
    }
  }

  return NextResponse.json({ results });
}
