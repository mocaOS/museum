import "server-only";
import {
  createDirectus,
  rest,
  staticToken,
  readItems,
  readItem,
  createItem,
  updateItem,
  uploadFiles,
} from "@directus/sdk";

/**
 * The community-submission review queue, stored in Directus (`library_submissions`).
 *
 * The museum app is otherwise DB-less, but the monorepo's Directus is the shared
 * datastore — so the queue (file + submitter + review status) lives there. This
 * module is the museum app's only writer: it uses a single scoped static token
 * (`DIRECTUS_SUBMISSIONS_TOKEN`); *who* may submit vs. approve is enforced by the
 * API routes via the SIWE session, not by Directus RBAC.
 */

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface LibrarySubmission {
  id: string;
  date_created?: string | null;
  title?: string | null;
  /** Directus file id (uuid). */
  file?: string | null;
  filename?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  /** Lowercased, SIWE-verified submitter address. */
  submitted_by?: string | null;
  status?: SubmissionStatus;
  rejected_reason?: string | null;
  cortex_document_id?: string | null;
  cortex_synced?: boolean;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
}

interface Schema {
  library_submissions: LibrarySubmission[];
}

function directusUrl(): string {
  return (process.env.DIRECTUS_URL || "").replace(/\/$/, "");
}

function submissionsToken(): string {
  return process.env.DIRECTUS_SUBMISSIONS_TOKEN || "";
}

/** True when the queue is wired up (URL + write token present). */
export function submissionsConfigured(): boolean {
  return !!(directusUrl() && submissionsToken());
}

function client() {
  return createDirectus<Schema>(directusUrl())
    .with(staticToken(submissionsToken()))
    .with(rest());
}

// Fields returned to the review UI — never expose the raw content, just metadata.
const LIST_FIELDS = [
  "id",
  "date_created",
  "title",
  "file",
  "filename",
  "file_type",
  "file_size",
  "submitted_by",
  "status",
  "rejected_reason",
  "cortex_document_id",
  "cortex_synced",
  "reviewed_by",
  "reviewed_at",
] as const;

/** Upload a file to Directus, returning its file id. */
export async function uploadSubmissionFile(
  file: File,
  title: string,
): Promise<string> {
  const form = new FormData();
  form.append("title", title);
  form.append("file", file, file.name);
  const created = await client().request(uploadFiles(form));
  const id = (created as { id?: string })?.id;
  if (!id) throw new Error("Directus file upload returned no id");
  return id;
}

export async function createSubmission(input: {
  title: string;
  file: string;
  filename: string;
  file_type: string;
  file_size: number;
  submitted_by: string;
}): Promise<LibrarySubmission> {
  return client().request(
    createItem("library_submissions", {
      ...input,
      submitted_by: input.submitted_by.toLowerCase(),
      status: "pending",
      cortex_synced: false,
    }),
  ) as Promise<LibrarySubmission>;
}

export async function listSubmissions(opts: {
  status?: SubmissionStatus;
  submittedBy?: string;
} = {}): Promise<LibrarySubmission[]> {
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = { _eq: opts.status };
  if (opts.submittedBy)
    filter.submitted_by = { _eq: opts.submittedBy.toLowerCase() };

  return client().request(
    readItems("library_submissions", {
      fields: [...LIST_FIELDS],
      filter: Object.keys(filter).length ? filter : undefined,
      sort: ["-date_created"],
      limit: 500,
    }),
  ) as Promise<LibrarySubmission[]>;
}

export async function getSubmission(
  id: string,
): Promise<LibrarySubmission | null> {
  try {
    return (await client().request(
      readItem("library_submissions", id, { fields: [...LIST_FIELDS] }),
    )) as LibrarySubmission;
  } catch {
    return null;
  }
}

export async function updateSubmission(
  id: string,
  patch: Partial<LibrarySubmission>,
): Promise<LibrarySubmission> {
  return client().request(
    updateItem("library_submissions", id, patch),
  ) as Promise<LibrarySubmission>;
}

/** Raw bytes of a submission's file, read server-side with the scoped token. */
export async function fetchSubmissionFile(fileId: string): Promise<Response> {
  return fetch(`${directusUrl()}/assets/${fileId}`, {
    headers: { Authorization: `Bearer ${submissionsToken()}` },
  });
}
