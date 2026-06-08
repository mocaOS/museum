"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, ErrorBanner, Table, Td, Th } from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import ConfirmModal from "./ConfirmModal";

interface BackendDocument {
  id: string;
  filename?: string;
  source?: string;
  collection_id?: string | null;
  status?: string;
  processing_progress?: number;
  image_progress_current?: number;
  image_progress_total?: number;
  created_at?: string;
  [k: string]: unknown;
}

interface Collection {
  id: string;
  name: string;
}

function isDocProcessing(status?: string): boolean {
  const s = (status || "").toLowerCase();
  return (
    s === "processing" ||
    s === "running" ||
    s === "pending" ||
    s === "queued" ||
    s === "in_progress"
  );
}

function StatusChip({ status }: { status?: string }) {
  const s = (status || "").toLowerCase();
  const color = (() => {
    if (s === "completed" || s === "complete" || s === "done" || s === "ready")
      return "var(--success)";
    if (s === "failed" || s === "error") return "var(--destructive)";
    if (isDocProcessing(s)) return "var(--accent)";
    return "var(--fg2)";
  })();
  return (
    <span
      className="text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-[var(--radius-sm)] inline-block"
      style={{
        background: "var(--muted)",
        color,
        fontFamily: "var(--font-mono)",
      }}
    >
      {status || "—"}
    </span>
  );
}

function DocStatusCell({ doc }: { doc: BackendDocument }) {
  const processing = isDocProcessing(doc.status);
  const progress =
    typeof doc.processing_progress === "number"
      ? doc.processing_progress
      : undefined;
  return (
    <div className="space-y-1.5 min-w-[140px]">
      <StatusChip status={doc.status} />
      {processing && typeof progress === "number" && (
        <div>
          <div
            className="h-1 w-full rounded-full overflow-hidden"
            style={{ background: "var(--muted)" }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, progress))}%`,
                background: "var(--accent)",
                height: "100%",
                transition: "width 300ms ease-out",
              }}
            />
          </div>
          <div
            className="text-[10.5px] mt-0.5"
            style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
          >
            {Math.round(progress)}%
          </div>
        </div>
      )}
    </div>
  );
}

export default function DocumentsTab() {
  const [docs, setDocs] = useState<BackendDocument[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingBusy, setPendingBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BackendDocument | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c, s] = await Promise.all([
        fetch("/api/admin/library/documents?limit=200").then((x) => x.json()),
        fetch("/api/admin/library/collections").then((x) => x.json()),
        fetch("/api/admin/library/stats")
          .then((x) => x.json())
          .catch(() => ({})),
      ]);
      if (d.error) throw new Error(d.error);
      setDocs(d.documents ?? []);
      setCollections(c.collections ?? []);
      setPendingCount(
        typeof s?.pending_task_count === "number" ? s.pending_task_count : 0
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while any doc is mid-processing or the backend reports pending tasks.
  const pollingRef = useRef<number | null>(null);
  const anyProcessing =
    docs.some((d) => isDocProcessing(d.status)) || pendingCount > 0;

  useEffect(() => {
    if (!anyProcessing) {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 3000);
    return () => {
      if (pollingRef.current) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [anyProcessing, load]);

  const collectionName = (id?: string | null) =>
    id ? collections.find((c) => c.id === id)?.name ?? id : "—";

  async function reprocess(doc: BackendDocument) {
    setBusyId(doc.id);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/library/documents/${doc.id}/reprocess`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("failedToLoad"));
      setToast(t("reprocessQueued"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setBusyId(null);
    }
  }

  async function processPending() {
    setPendingBusy(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/admin/library/documents/process-pending",
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("failedToLoad"));
      setToast(t("pendingQueued"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setPendingBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/admin/library/documents/${deleteTarget.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("failedToDelete"));
    setDeleteTarget(null);
    await load();
  }

  const processPendingBlock =
    pendingBusy ? "" : pendingCount === 0 ? t("blockedNoPending") : "";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p
          className="text-[13px] max-w-3xl"
          style={{ color: "var(--fg2)" }}
        >
          {t("documentsDescription")}
        </p>
        <Button
          onClick={processPending}
          disabled={pendingBusy || !!processPendingBlock}
          title={processPendingBlock || undefined}
        >
          {pendingBusy ? t("processingPending") : t("processPending")}
        </Button>
      </div>

      <ErrorBanner message={error} />
      {toast && (
        <div
          className="text-[12px] rounded-[var(--radius)] px-3 py-2 border"
          style={{
            background: "color-mix(in oklch, var(--success) 14%, transparent)",
            borderColor:
              "color-mix(in oklch, var(--success) 32%, transparent)",
            color: "var(--success)",
          }}
        >
          {toast}
        </div>
      )}

      {anyProcessing && (
        <div
          className="text-[12.5px] rounded-[var(--radius)] px-3 py-2 border flex items-center gap-2"
          style={{
            background: "color-mix(in oklch, var(--accent) 12%, transparent)",
            borderColor: "color-mix(in oklch, var(--accent) 30%, transparent)",
            color: "var(--accent)",
          }}
        >
          <span
            className="inline-block rounded-full"
            style={{
              width: 7,
              height: 7,
              background: "currentColor",
              animation: "pulse-dot 1.2s ease-in-out infinite",
            }}
          />
          {t("pipelineBusy")}
        </div>
      )}

      {loading ? (
        <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
          {t("loading")}
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("tableFilename")}</Th>
              <Th>{t("tableCollections")}</Th>
              <Th>{t("tableStatus")}</Th>
              <Th>{t("tableCreated")}</Th>
              <Th>{t("actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {docs.length === 0 && (
              <tr>
                <Td className="text-[var(--fg2)]">{t("noDocuments")}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
              </tr>
            )}
            {docs.map((d) => {
              const processing = isDocProcessing(d.status);
              const blockMsg = processing ? t("blockedDocProcessing") : "";
              return (
                <tr key={d.id}>
                  <Td>
                    <div style={{ color: "var(--fg1)" }}>
                      {d.filename || d.source || d.id}
                    </div>
                    <div
                      className="text-[11px]"
                      style={{
                        color: "var(--fg2)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {d.id}
                    </div>
                  </Td>
                  <Td>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-[var(--radius-sm)]"
                      style={{
                        background: "var(--muted)",
                        color: "var(--fg1)",
                      }}
                    >
                      {collectionName(d.collection_id)}
                    </span>
                  </Td>
                  <Td>
                    <DocStatusCell doc={d} />
                  </Td>
                  <Td
                    style={{
                      color: "var(--fg2)",
                      fontFamily: "var(--font-mono)",
                    }}
                    className="text-[12px]"
                  >
                    {d.created_at
                      ? new Date(d.created_at).toLocaleDateString()
                      : "—"}
                  </Td>
                  <Td>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => reprocess(d)}
                        disabled={busyId === d.id || processing}
                        title={blockMsg || undefined}
                      >
                        {busyId === d.id ? t("reprocessing") : t("reprocess")}
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => setDeleteTarget(d)}
                        disabled={processing}
                        title={blockMsg || undefined}
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title={t("deleteDocument")}
        body={t("deleteDocumentWarning")}
        confirmLabel={t("delete")}
        confirmPhrase={deleteTarget?.filename || deleteTarget?.id || ""}
        confirmPhraseLabel={t("deleteDocumentConfirmLabel")}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
