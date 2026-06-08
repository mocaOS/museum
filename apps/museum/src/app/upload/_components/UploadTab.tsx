"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, ErrorBanner, Select } from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import { getConfig } from "@/lib/config";

function formatMaxBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

interface Toast {
  kind: "success" | "error";
  text: string;
}

export default function UploadTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const loadScope = useCallback(async () => {
    const res = await fetch("/api/me/upload-scope");
    if (res.status === 403) {
      setError(t("noUploadPermission"));
      setCollections([]);
      return;
    }
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
    setCollections(data.collections ?? []);
    if (data.collections?.length > 0) {
      setCollectionId(data.collections[0].id);
    }
  }, []);

  useEffect(() => {
    loadScope();
  }, [loadScope]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setToast(null);

    const cfg = await getConfig();
    if (file.size > cfg.maxUploadBytes) {
      setToast({
        kind: "error",
        text: t("fileTooLarge", { max: formatMaxBytes(cfg.maxUploadBytes) }),
      });
      setUploading(false);
      return;
    }

    const form = new FormData();
    form.append("file", file);
    if (collectionId) form.append("collection_id", collectionId);

    try {
      const res = await fetch("/api/me/upload", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("uploadFailed"));
      setToast({
        kind: "success",
        text: t("fileUploaded", { name: file.name }),
      });
      setFile(null);
      const input = document.getElementById("upload-file") as
        | HTMLInputElement
        | null;
      if (input) input.value = "";
    } catch (err) {
      setToast({
        kind: "error",
        text: err instanceof Error ? err.message : t("uploadFailed"),
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-[13px]" style={{ color: "var(--fg2)" }}>
        {t("uploadDescription")}
      </p>

      <ErrorBanner message={error} />

      {!error && (
        <form
          onSubmit={handleUpload}
          className="rounded-[var(--radius-lg)] border p-5 space-y-4"
          style={{ background: "var(--card)", borderColor: "var(--border)" }}
        >
          <Select
            label={t("collection")}
            value={collectionId}
            onChange={(e) => setCollectionId(e.target.value)}
          >
            {collections.length === 0 && (
              <option value="">{t("noCollectionsAvailable")}</option>
            )}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <label className="block space-y-1.5">
            <span
              className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
              style={{ color: "var(--fg2)" }}
            >
              {t("file")}
            </span>
            <input
              id="upload-file"
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-[13px] file:mr-3 file:px-3 file:py-1.5 file:rounded-[var(--radius)] file:border file:text-[13px] file:cursor-pointer"
              style={{ color: "var(--fg1)" }}
              accept=".pdf,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.html,.htm,.txt,.md,.mdx,.markdown,.rst,.tex,.latex,.xml,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.wav,.mp3,.webvtt,.vtt"
            />
            <span className="text-[12px]" style={{ color: "var(--fg2)" }}>
              {t("supportedFormats")}
            </span>
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="submit"
              disabled={!file || uploading || !collectionId}
            >
              {uploading ? t("uploading") : t("upload")}
            </Button>
          </div>
        </form>
      )}

      {toast && (
        <div
          className="text-[13px] rounded-[var(--radius)] px-3 py-2 border space-y-1"
          style={
            toast.kind === "success"
              ? {
                  background: "color-mix(in oklch, var(--success) 14%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--success) 32%, transparent)",
                  color: "var(--success)",
                }
              : {
                  background:
                    "color-mix(in oklch, var(--destructive) 12%, transparent)",
                  borderColor:
                    "color-mix(in oklch, var(--destructive) 30%, transparent)",
                  color: "var(--destructive)",
                }
          }
        >
          <div>{toast.text}</div>
          {toast.kind === "success" && (
            <div className="text-[11.5px] opacity-80">
              {t("processingStartedHint")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
