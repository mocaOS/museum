"use client";

import { useCallback, useEffect, useState } from "react";
import Modal from "@/components/admin/Modal";
import {
  Button,
  ErrorBanner,
  Input,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import ConfirmModal from "./ConfirmModal";

interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

export default function CollectionsTab() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Collection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/library/collections");
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || t("failedToLoad"));
      }
      setCollections(data.collections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/admin/library/collections/${deleteTarget.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || t("failedToDelete"));
    setDeleteTarget(null);
    setToast(t("collectionDeleted"));
    await load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <p
          className="text-[13px] max-w-3xl"
          style={{ color: "var(--fg2)" }}
        >
          {t("collectionsDescription")}
        </p>
        <Button onClick={() => setCreateOpen(true)}>
          {t("newCollection")}
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

      {loading ? (
        <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
          {t("loading")}
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("name")}</Th>
              <Th>{t("description")}</Th>
              <Th>{t("tableDocuments")}</Th>
              <Th>{t("actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {collections.length === 0 && (
              <tr>
                <Td className="text-[var(--fg2)]">{t("noCollectionsYet")}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
              </tr>
            )}
            {collections.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div style={{ color: "var(--fg1)" }}>{c.name}</div>
                  <div
                    className="text-[11px]"
                    style={{
                      color: "var(--fg2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {c.id}
                  </div>
                </Td>
                <Td
                  className="text-[12.5px]"
                  style={{ color: "var(--fg2)" }}
                >
                  {c.description || "—"}
                </Td>
                <Td
                  className="text-[12px]"
                  style={{
                    color: (c.document_count ?? 0) > 0 ? "var(--fg1)" : "var(--fg2)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {c.document_count ?? 0}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setRenameTarget(c)}
                    >
                      {t("rename")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => setDeleteTarget(c)}
                    >
                      {t("delete")}
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {createOpen && (
        <CollectionForm
          title={t("newCollectionTitle")}
          submitLabel={t("createCollection")}
          onClose={() => setCreateOpen(false)}
          onSubmit={async ({ name, description }) => {
            const res = await fetch("/api/admin/library/collections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                description: description || undefined,
              }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("saveFailed"));
            setCreateOpen(false);
            setToast(t("collectionCreated"));
            await load();
          }}
        />
      )}

      {renameTarget && (
        <CollectionForm
          title={t("renameCollectionTitle")}
          submitLabel={t("save")}
          initial={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSubmit={async ({ name, description }) => {
            const res = await fetch(
              `/api/admin/library/collections/${renameTarget.id}`,
              {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name,
                  description: description || undefined,
                }),
              }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || t("saveFailed"));
            setRenameTarget(null);
            setToast(t("collectionRenamed"));
            await load();
          }}
        />
      )}

      <ConfirmModal
        open={!!deleteTarget}
        title={t("deleteCollectionTitle")}
        body={
          (deleteTarget?.document_count ?? 0) > 0
            ? t("deleteCollectionWarning", {
                count: deleteTarget?.document_count ?? 0,
              })
            : t("deleteCollectionEmptyBody")
        }
        confirmLabel={t("delete")}
        confirmPhrase={deleteTarget?.name || ""}
        confirmPhraseLabel={t("deleteCollectionConfirmLabel")}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function CollectionForm({
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: Collection;
  onClose: () => void;
  onSubmit: (vals: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name, description });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" type="button" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="collection-form"
            disabled={saving || !name.trim()}
          >
            {saving ? t("saving") : submitLabel}
          </Button>
        </>
      }
    >
      <form id="collection-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <Textarea
          label={t("descriptionOptional")}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}
