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
import { useLocale } from "@/lib/i18n-client";

interface GroupRow {
  id: string;
  name: string;
  description: string;
  collectionIds: string[];
  memberCount: number;
}

interface Collection {
  id: string;
  name: string;
  description?: string;
  document_count?: number;
}

export default function AdminGroupsPage() {
  useLocale();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<GroupRow | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, c] = await Promise.all([
        fetch("/api/admin/groups").then((r) => r.json()),
        fetch("/api/admin/collections").then((r) => r.json()),
      ]);
      if (g.error) throw new Error(g.error);
      if (c.error) throw new Error(c.error);
      setGroups(g.groups ?? []);
      setCollections(c.collections ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm(t("deleteGroupConfirm"))) {
      return;
    }
    const res = await fetch(`/api/admin/groups/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || t("failedToDelete"));
      return;
    }
    await load();
  }

  return (
    <div className="max-w-5xl space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-bold"
            style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
          >
            {t("groupsHeading")}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--fg2)" }}>
            {t("groupsDescription")}
          </p>
        </div>
        <Button onClick={() => setEditing("new")}>{t("newGroup")}</Button>
      </div>

      <ErrorBanner message={error} />

      {loading ? (
        <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
          {t("loading")}
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("name")}</Th>
              <Th>{t("tableMembers")}</Th>
              <Th>{t("tableCollections")}</Th>
              <Th>{t("actions")}</Th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <Td className="text-[var(--text-secondary)]">
                  {t("noGroupsYet")}
                </Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
              </tr>
            )}
            {groups.map((g) => (
              <tr key={g.id}>
                <Td>
                  <div className="font-medium">{g.name}</div>
                  {g.description && (
                    <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {g.description}
                    </div>
                  )}
                </Td>
                <Td>{g.memberCount}</Td>
                <Td>
                  {g.collectionIds.length === 0 ? (
                    <span className="text-[var(--text-secondary)]">
                      {t("allCollections")}
                    </span>
                  ) : (
                    <span>
                      {t("scopedCount", { count: g.collectionIds.length })}
                    </span>
                  )}
                </Td>
                <Td>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setEditing(g)}>
                      {t("edit")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={() => handleDelete(g.id)}
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

      {editing && (
        <GroupForm
          group={editing === "new" ? null : editing}
          collections={collections}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

function GroupForm({
  group,
  collections,
  onClose,
  onSaved,
}: {
  group: GroupRow | null;
  collections: Collection[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [allCollections, setAllCollections] = useState(
    (group?.collectionIds.length ?? 0) === 0
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(group?.collectionIds ?? [])
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const collectionIds = allCollections ? [] : Array.from(selected);
    try {
      const res = await fetch(
        group ? `/api/admin/groups/${group.id}` : "/api/admin/groups",
        {
          method: group ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description, collectionIds }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("saveFailed"));
      }
      onSaved();
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
      title={
        group ? t("editGroupTitle", { name: group.name }) : t("newGroupTitle")
      }
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} type="button">
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            form="group-form"
            disabled={saving || !name.trim()}
          >
            {saving
              ? t("saving")
              : group
                ? t("saveChanges")
                : t("createGroup")}
          </Button>
        </>
      }
    >
      <form id="group-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
        <Textarea
          label={t("descriptionOptional")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <div className="space-y-2">
          <div
            className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--fg2)" }}
          >
            {t("collections")}
          </div>
          <label
            className="flex items-center gap-2 text-[13px] cursor-pointer"
            style={{ color: "var(--fg1)" }}
          >
            <input
              type="checkbox"
              checked={allCollections}
              onChange={(e) => setAllCollections(e.target.checked)}
            />
            <span>{t("accessAllCollections")}</span>
          </label>

          <div
            className={`rounded-[var(--radius)] max-h-64 overflow-y-auto border divide-y ${
              allCollections ? "opacity-50 pointer-events-none" : ""
            }`}
            style={{
              borderColor: "var(--border)",
              background: "var(--bg)",
            }}
          >
            {collections.length === 0 ? (
              <div
                className="px-3 py-4 text-[13px]"
                style={{ color: "var(--fg2)" }}
              >
                {t("noCollectionsFromBackend")}
              </div>
            ) : (
              collections.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors"
                  style={{ borderColor: "var(--border)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <div className="flex-1">
                    <div className="text-[13px]" style={{ color: "var(--fg1)" }}>
                      {c.name}
                    </div>
                    {c.description && (
                      <div className="text-[11.5px]" style={{ color: "var(--fg2)" }}>
                        {c.description}
                      </div>
                    )}
                  </div>
                  {typeof c.document_count === "number" && (
                    <div
                      className="text-[11px]"
                      style={{
                        color: "var(--fg2)",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {t("docsBadge", { count: c.document_count })}
                    </div>
                  )}
                </label>
              ))
            )}
          </div>
        </div>

        <ErrorBanner message={error} />
      </form>
    </Modal>
  );
}
