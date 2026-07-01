import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/web3/session";
import { isLibraryAdmin } from "@/lib/web3/admins";
import {
  submissionsConfigured,
  uploadSubmissionFile,
  createSubmission,
  listSubmissions,
  type SubmissionStatus,
} from "@/lib/library/submissions";
import {
  MAX_SUBMISSION_BYTES,
  ALLOWED_EXTENSIONS,
} from "@/lib/library/cortex-management";
import { getHoldings } from "@/lib/web3/holdings";
import {
  isEligibleToSubmit,
  SUBMIT_REQUIREMENT_TEXT,
} from "@/lib/web3/eligibility";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Submit a document for review. Requires a SIWE session; the submitter address
 * comes from the verified session, never from client input. The file lands in
 * the Directus queue as `pending` — it is NOT sent to Cortex until an admin
 * approves it.
 */
export async function POST(req: NextRequest) {
  if (!submissionsConfigured()) {
    return NextResponse.json(
      { error: "Submissions are not configured" },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to submit" }, { status: 401 });
  }

  // Holdings gate (mirrors the client button). Enforced here so a disabled
  // button can't be bypassed with a direct POST.
  try {
    const holdings = await getHoldings(session.address);
    if (!isEligibleToSubmit(holdings)) {
      return NextResponse.json(
        { error: SUBMIT_REQUIREMENT_TEXT },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Couldn't verify your holdings — please try again" },
      { status: 502 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_SUBMISSION_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 50 MB)" },
      { status: 400 },
    );
  }

  const rawTitle = (form.get("title") as string | null)?.trim();
  const title = (rawTitle || file.name).slice(0, 200);

  try {
    const fileId = await uploadSubmissionFile(file, title);
    const submission = await createSubmission({
      title,
      file: fileId,
      filename: file.name.slice(0, 255),
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
      submitted_by: session.address,
    });
    return NextResponse.json({ submission }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 502 },
    );
  }
}

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  submitted_by: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
});

/** List submissions for the review table. Admin only. */
export async function GET(req: NextRequest) {
  if (!submissionsConfigured()) {
    return NextResponse.json({ submissions: [] });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isLibraryAdmin(session.address)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const parsed = listQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  }

  try {
    const submissions = await listSubmissions({
      status: parsed.data.status as SubmissionStatus | undefined,
      submittedBy: parsed.data.submitted_by,
    });
    return NextResponse.json({ submissions });
  } catch {
    return NextResponse.json(
      { error: "Could not read submissions" },
      { status: 502 },
    );
  }
}
