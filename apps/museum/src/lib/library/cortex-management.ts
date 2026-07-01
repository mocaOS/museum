import "server-only";
import { getCortexUrl, getCortexManagementKey } from "@/lib/cortex";

/**
 * Write-side Cortex client for promoting approved submissions into the
 * "Collective" collection. Uses the management key (`CORTEX_MANAGEMENT_API_KEY`)
 * exclusively — never the read-only chat key. Mirrors the ingest flow in
 * apps/hyperfy/harvest-hyperfy-docs.mjs (resolve-or-create collection + upload).
 */

const COLLECTIVE_NAME = process.env.CORTEX_COLLECTIVE_COLLECTION || "Collective";

// Cortex enforces this; enforce it here too so we fail before the upload.
export const MAX_SUBMISSION_BYTES = 50 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".docx", ".xlsx"];

let collectiveIdCache: string | null = null;

export function managementConfigured(): boolean {
  return !!(getCortexManagementKey() && getCortexUrl());
}

function call(path: string, init: RequestInit = {}): Promise<Response> {
  const key = getCortexManagementKey() || "";
  return fetch(`${getCortexUrl()}${path}`, {
    ...init,
    headers: { "X-API-Key": key, ...(init.headers || {}) },
  });
}

/** Resolve (or lazily create) the target collection id, cached per process. */
export async function resolveCollectiveId(): Promise<string> {
  if (collectiveIdCache) return collectiveIdCache;

  const listRes = await call("/api/collections");
  if (!listRes.ok) {
    throw new Error(`Cortex collections list failed (${listRes.status})`);
  }
  const { collections } = (await listRes.json()) as {
    collections: { id: string; name: string }[];
  };
  const hit = collections.find(
    (c) => c.name.toLowerCase() === COLLECTIVE_NAME.toLowerCase(),
  );
  if (hit) {
    collectiveIdCache = hit.id;
    return hit.id;
  }

  const created = await call("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: COLLECTIVE_NAME,
      description:
        "Community-submitted documents reviewed and approved into the MOCA Library.",
    }),
  });
  if (!created.ok) {
    throw new Error(`Cortex collection create failed (${created.status})`);
  }
  const col = (await created.json()) as { id: string };
  collectiveIdCache = col.id;
  return col.id;
}

/**
 * Upload a file into the Collective collection and start processing. Encodes the
 * submitter address into Cortex's free-text `source` field for provenance.
 * Returns the created Cortex document id.
 */
export async function uploadToCollective(params: {
  bytes: ArrayBuffer;
  filename: string;
  contentType: string;
  submittedBy: string;
}): Promise<string> {
  const collectionId = await resolveCollectiveId();

  const form = new FormData();
  form.append(
    "file",
    new Blob([params.bytes], { type: params.contentType || "application/octet-stream" }),
    params.filename,
  );

  const qs = new URLSearchParams({
    collection_id: collectionId,
    start_processing: "true",
    source: `community:${params.submittedBy.toLowerCase()}`,
  });

  const res = await call(`/api/upload?${qs.toString()}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Cortex upload failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }
  const data = (await res.json()) as { document_id?: string };
  if (!data.document_id) throw new Error("Cortex upload returned no document_id");
  return data.document_id;
}
