import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";
import {
  submissionsConfigured,
  getSubmission,
  updateSubmission,
  fetchSubmissionFile,
} from "@/lib/library/submissions";
import {
  managementConfigured,
  uploadToCollective,
} from "@/lib/library/cortex-management";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Directus primary keys may be UUIDs (string) or auto-increment (number),
// depending on how the collection was created — accept either, normalize to
// string for the Directus SDK (which resolves both).
const bodySchema = z.object({
  ids: z
    .array(z.union([z.string().min(1), z.number().int()]))
    .min(1)
    .max(100)
    .transform((arr) => arr.map(String)),
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

/**
 * Approve selected submissions: push each file into the Cortex "Collective"
 * collection via the management key, then flip the row to `approved`. Admin only.
 * Processed serially (~1.1 s apart) to respect Cortex's ~1 rps upload limit; a
 * per-item failure leaves that row `pending` so it can be retried.
 */
export async function POST(req: NextRequest) {
  if (!submissionsConfigured() || !managementConfigured()) {
    return NextResponse.json(
      { error: "Approvals are not configured" },
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
  let processed = 0;

  for (const id of parsed.data.ids) {
    try {
      const sub = await getSubmission(id);
      if (!sub) {
        results.push({ id, ok: false, error: "Not found" });
        continue;
      }
      if (sub.status === "approved" && sub.cortex_synced) {
        results.push({ id, ok: true });
        continue;
      }
      if (!sub.file) {
        results.push({ id, ok: false, error: "Missing file" });
        continue;
      }

      // Respect Cortex's ~1 rps between actual uploads.
      if (processed > 0) await sleep(1100);
      processed++;

      const fileRes = await fetchSubmissionFile(sub.file);
      if (!fileRes.ok) throw new Error(`file fetch failed (${fileRes.status})`);
      const bytes = await fileRes.arrayBuffer();

      const cortexDocumentId = await uploadToCollective({
        bytes,
        filename: sub.filename || `${id}.txt`,
        contentType: sub.file_type || "application/octet-stream",
        submittedBy: sub.submitted_by || "unknown",
      });

      await updateSubmission(id, {
        status: "approved",
        cortex_document_id: cortexDocumentId,
        cortex_synced: true,
        rejected_reason: null,
        reviewed_by: session.address,
        reviewed_at: now,
      });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({
        id,
        ok: false,
        error: err instanceof Error ? err.message : "Approval failed",
      });
    }
  }

  return NextResponse.json({ results });
}
