import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";
import {
  submissionsConfigured,
  getSubmission,
  fetchSubmissionFile,
} from "@/lib/library/submissions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Stream a submission's file for the review UI (preview/download). Admin only —
 * the Directus token stays server-side, so submitted files are never publicly
 * reachable.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!submissionsConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const session = await getSession();
  if (!session || !isLibraryAdmin(session.address)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const { id } = await params;
  const sub = await getSubmission(id);
  if (!sub?.file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const upstream = await fetchSubmissionFile(sub.file);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "File unavailable" }, { status: 502 });
  }

  const contentType =
    upstream.headers.get("content-type") ||
    sub.file_type ||
    "application/octet-stream";
  const inline = contentType === "application/pdf" || contentType.startsWith("text/");
  const filename = (sub.filename || "document").replace(/"/g, "");

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
