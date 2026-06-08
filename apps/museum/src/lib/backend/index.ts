import "server-only";

// Thin wrappers over the Cortex backend admin API. All requests use the
// master admin-tier key from env (BACKEND_ADMIN_API_KEY) — never a user key.

// Single source of truth for the Cortex backend URL. CORTEX_API_URL is the
// canonical name; deprecated aliases (NEXT_PUBLIC_API_URL, LIBRARY_API_URL)
// are mirrored onto it at boot in src/instrumentation.ts.
export function getBackendUrl(): string {
  return process.env.CORTEX_API_URL || "http://localhost:8000";
}

function adminKey(): string {
  const k = process.env.BACKEND_ADMIN_API_KEY;
  if (!k) {
    throw new Error(
      "BACKEND_ADMIN_API_KEY is required to perform admin operations against Cortex."
    );
  }
  return k;
}

async function call<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": adminKey(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BackendError(
      `Cortex backend ${init?.method ?? "GET"} ${path} -> ${res.status}: ${body.slice(0, 400)}`,
      res.status
    );
  }
  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export class BackendError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "BackendError";
  }
}

// --- Collections ------------------------------------------------------------

export interface BackendCollection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

export async function listBackendCollections(): Promise<BackendCollection[]> {
  const data = await call<{ collections?: BackendCollection[] } | BackendCollection[]>(
    "/api/collections"
  );
  if (Array.isArray(data)) return data;
  return data.collections ?? [];
}

export async function createCollection(input: {
  name: string;
  description?: string;
}): Promise<BackendCollection> {
  return call<BackendCollection>("/api/collections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function renameCollection(
  id: string,
  patch: { name: string; description?: string }
): Promise<BackendCollection> {
  return call<BackendCollection>(`/api/collections/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function deleteCollection(id: string): Promise<void> {
  await call(`/api/collections/${id}`, { method: "DELETE" });
}

// --- Documents --------------------------------------------------------------

export interface BackendDocument {
  id: string;
  filename?: string;
  source?: string;
  collection_id?: string | null;
  status?: string;
  processing_progress?: number;
  image_progress_current?: number;
  image_progress_total?: number;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function listDocuments(params: {
  limit?: number;
  offset?: number;
  collection_id?: string;
  status?: string;
} = {}): Promise<{ documents: BackendDocument[]; total?: number }> {
  const qs = new URLSearchParams();
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  if (params.collection_id) qs.set("collection_id", params.collection_id);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  const data = await call<
    { documents?: BackendDocument[]; total?: number } | BackendDocument[]
  >(`/api/documents${suffix}`);
  if (Array.isArray(data)) return { documents: data };
  return { documents: data.documents ?? [], total: data.total };
}

export async function reprocessDocument(id: string): Promise<unknown> {
  return call(`/api/documents/${id}/reprocess`, { method: "POST" });
}

export async function processPendingDocuments(): Promise<unknown> {
  return call(`/api/documents/process-pending`, { method: "POST" });
}

export async function deleteDocument(id: string): Promise<unknown> {
  return call(`/api/documents/${id}`, { method: "DELETE" });
}

// --- Graph ------------------------------------------------------------------

export interface BackendGraphStatus {
  entity_count?: number;
  within_document_relationship_count?: number;
  cross_document_relationship_count?: number;
  relationship_count?: number;
  community_count?: number;
  err?: number;
  steps?: {
    entity_extraction?: { status?: string; progress?: number; [k: string]: unknown };
    relationship_analysis?: { status?: string; progress?: number; [k: string]: unknown };
    community_detection?: { status?: string; progress?: number; [k: string]: unknown };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export async function getGraphStatus(
  collectionId?: string
): Promise<BackendGraphStatus> {
  const suffix = collectionId ? `?collection_id=${encodeURIComponent(collectionId)}` : "";
  return call<BackendGraphStatus>(`/api/graph/status${suffix}`);
}

export async function analyzeRelationships(input: {
  collection_id?: string;
  rebuild?: boolean;
} = {}): Promise<unknown> {
  return call(`/api/graph/relationships/analyze`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function detectCommunities(
  input: { collection_id?: string } = {}
): Promise<unknown> {
  return call(`/api/graph/communities/detect`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function summarizeCommunities(): Promise<unknown> {
  return call(`/api/graph/communities/summarize`, { method: "POST" });
}

export async function cleanupOrphanedEntities(): Promise<unknown> {
  return call(`/api/cleanup/orphaned-entities`, { method: "POST" });
}

// --- Stats & Tasks ----------------------------------------------------------

export interface BackendStats {
  document_count?: number;
  chunk_count?: number;
  entity_count?: number;
  relationship_count?: number;
  community_count?: number;
  pending_task_count?: number;
  [k: string]: unknown;
}

export async function getBackendStats(): Promise<BackendStats> {
  return call<BackendStats>(`/api/stats`);
}

export interface BackendTask {
  id: string;
  status?: string;
  kind?: string;
  type?: string;
  progress?: number;
  message?: string;
  error?: string;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export async function listTasks(params: {
  status?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<BackendTask[]> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const suffix = qs.toString() ? `?${qs}` : "";
  const data = await call<{ tasks?: BackendTask[] } | BackendTask[]>(
    `/api/tasks${suffix}`
  );
  if (Array.isArray(data)) return data;
  return data.tasks ?? [];
}

export async function getTask(id: string): Promise<BackendTask> {
  return call<BackendTask>(`/api/tasks/${id}`);
}

// --- API Keys --------------------------------------------------------------

export type BackendPermission = "read" | "manage" | "admin";

export interface BackendKeyCreateInput {
  permission: BackendPermission;
  collection_ids?: string[]; // omitted / empty = all collections
  label?: string;
  name?: string;
}

export interface BackendKeyCreateResult {
  id: string;
  key: string; // the plaintext secret — only returned once at creation
  permission: BackendPermission;
  collection_ids?: string[];
}

export async function createBackendKey(
  input: BackendKeyCreateInput
): Promise<BackendKeyCreateResult> {
  // Backend schema: permissions is a plural array; collection_ids omitted = all.
  const body: Record<string, unknown> = {
    permissions: [input.permission],
    name: input.name ?? input.label ?? `cortex-chat-${input.permission}`,
  };
  if (input.collection_ids && input.collection_ids.length > 0) {
    body.collection_ids = input.collection_ids;
  }
  return call<BackendKeyCreateResult>("/api/admin/api-keys", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateBackendKey(
  id: string,
  patch: { collection_ids?: string[]; label?: string; name?: string }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.collection_ids !== undefined) body.collection_ids = patch.collection_ids;
  if (patch.name !== undefined) body.name = patch.name;
  await call(`/api/admin/api-keys/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteBackendKey(id: string): Promise<void> {
  await call(`/api/admin/api-keys/${id}`, { method: "DELETE" });
}

// --- Usage ------------------------------------------------------------------

export interface BackendUsageRow {
  key_id?: string;
  date?: string;
  count?: number;
  endpoint?: string;
  [k: string]: unknown;
}

export async function fetchBackendUsage(): Promise<BackendUsageRow[]> {
  try {
    const data = await call<{ usage?: BackendUsageRow[] } | BackendUsageRow[]>(
      "/api/admin/api-usage"
    );
    if (Array.isArray(data)) return data;
    return data.usage ?? [];
  } catch (err) {
    if (err instanceof BackendError && err.status === 404) return [];
    throw err;
  }
}
