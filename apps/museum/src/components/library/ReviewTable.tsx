"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEnsNames } from "@/hooks/useEnsNames";
import { AddressLabel } from "@/components/wallet/AddressLabel";

type SubmissionStatus = "pending" | "approved" | "rejected";

interface Submission {
  id: string;
  date_created?: string | null;
  title?: string | null;
  filename?: string | null;
  file_type?: string | null;
  file_size?: number | null;
  submitted_by?: string | null;
  status?: SubmissionStatus;
  rejected_reason?: string | null;
  cortex_document_id?: string | null;
  cortex_synced?: boolean;
}

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, monospace";

const STATUS_TABS: { key: SubmissionStatus | ""; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "", label: "All" },
];

async function fetchSubmissions(
  status: SubmissionStatus | "",
): Promise<Submission[]> {
  const qs = status ? `?status=${status}` : "";
  const res = await fetch(`/api/library/submissions${qs}`, {
    cache: "no-store",
  });
  if (res.status === 403) throw new Error("not-admin");
  if (!res.ok) throw new Error("Failed to load submissions");
  const body = (await res.json()) as { submissions: Submission[] };
  return body.submissions ?? [];
}

function fmtBytes(n: number | null | undefined): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ReviewTable() {
  const [statusFilter, setStatusFilter] = useState<SubmissionStatus | "">(
    "pending",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["library-submissions", statusFilter],
    queryFn: () => fetchSubmissions(statusFilter),
    staleTime: 10_000,
  });

  const submissions = useMemo(() => data ?? [], [data]);
  const ensMap = useEnsNames(submissions.map((s) => s.submitted_by));

  // Filter by submitter address OR resolved ENS (case-insensitive substring).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) => {
      const addr = (s.submitted_by || "").toLowerCase();
      const ens = (ensMap[addr] || "").toLowerCase();
      return addr.includes(q) || ens.includes(q);
    });
  }, [submissions, query, ensMap]);

  const selectable = statusFilter === "pending";
  const allSelected =
    selectable && filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((s) => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAction = async (
    kind: "approve" | "reject",
    ids: string[],
    reason?: string,
  ) => {
    if (ids.length === 0) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/library/submissions/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reason ? { ids, reason } : { ids }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        results?: { id: string; ok: boolean; error?: string }[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error || `${kind} failed`);
      const failures = (body.results || []).filter((r) => !r.ok);
      if (failures.length) {
        setActionError(
          `${failures.length} of ${ids.length} failed: ${failures
            .map((f) => f.error)
            .filter(Boolean)
            .slice(0, 2)
            .join("; ")}`,
        );
      }
      setSelected(new Set());
      await refetch();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : `${kind} failed`);
    } finally {
      setBusy(false);
    }
  };

  const approveSelected = () => runAction("approve", [...selected]);
  const rejectSelected = () => {
    const reason =
      typeof window !== "undefined"
        ? window.prompt("Reason for rejection (optional):") || undefined
        : undefined;
    runAction("reject", [...selected], reason);
  };

  if (isError && (error as Error)?.message === "not-admin") {
    return (
      <div className="py-16 text-center">
        <p className="text-sm" style={{ color: "var(--fg2)" }}>
          Your address is not on the reviewer whitelist.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 border-b" style={{ borderColor: "var(--border)" }}>
          {STATUS_TABS.map((tab) => {
            const on = tab.key === statusFilter;
            return (
              <button
                key={tab.key || "all"}
                type="button"
                onClick={() => {
                  setStatusFilter(tab.key);
                  setSelected(new Set());
                }}
                className="relative -mb-px px-3 py-2 text-sm transition-colors"
                style={{ color: on ? "var(--fg1)" : "var(--fg2)" }}
              >
                {tab.label}
                {on && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-px"
                    style={{ background: "var(--accent)" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by address or ENS…"
          className="h-9 w-full max-w-[280px] rounded-[var(--radius)] border bg-transparent px-3 text-sm outline-none"
          style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
        />
      </div>

      {/* Bulk action bar */}
      {selectable && selected.size > 0 && (
        <div
          className="flex items-center justify-between rounded-[var(--radius)] border px-3 py-2"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
        >
          <span className="text-sm" style={{ color: "var(--fg1)" }}>
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={rejectSelected}
              disabled={busy}
              className="rounded-[var(--radius)] border px-3 py-1.5 text-sm transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
            >
              Reject
            </button>
            <button
              type="button"
              onClick={approveSelected}
              disabled={busy}
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm font-medium transition-transform active:scale-[0.98] disabled:opacity-50"
              style={{ background: "var(--accent)", color: "oklch(0.2 0 0)" }}
            >
              {busy ? "Working…" : "Approve"}
            </button>
          </div>
        </div>
      )}

      {actionError && (
        <p className="text-sm" style={{ color: "var(--destructive)" }}>
          {actionError}
        </p>
      )}

      {/* Table */}
      <div
        className="overflow-x-auto rounded-[var(--radius)] border"
        style={{ borderColor: "var(--border)" }}
      >
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr style={{ color: "var(--fg2)" }}>
              {selectable && (
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
              )}
              <Th>Document</Th>
              <Th>Submitted by</Th>
              <Th>Date</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>File</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center" style={{ color: "var(--fg2)" }}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center" style={{ color: "var(--fg3)" }}>
                  No submissions.
                </td>
              </tr>
            ) : (
              filtered.map((s) => {
                const addr = (s.submitted_by || "").toLowerCase();
                return (
                  <tr
                    key={s.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {selectable && (
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(s.id)}
                          onChange={() => toggleOne(s.id)}
                          aria-label={`Select ${s.title || s.filename}`}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5" style={{ color: "var(--fg1)" }}>
                      <div className="max-w-[240px] truncate" title={s.title || s.filename || ""}>
                        {s.title || s.filename || "Untitled"}
                      </div>
                      {s.filename && s.title !== s.filename && (
                        <div className="max-w-[240px] truncate text-[11px]" style={{ color: "var(--fg3)" }}>
                          {s.filename}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {addr ? (
                        <AddressLabel
                          address={addr}
                          name={ensMap[addr]}
                          className="text-[13px]"
                          style={{
                            fontFamily: ensMap[addr] ? undefined : MONO,
                            color: "var(--fg1)",
                          }}
                        />
                      ) : (
                        <span style={{ color: "var(--fg3)" }}>—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ fontFamily: MONO, color: "var(--fg2)" }}>
                      {fmtDate(s.date_created)}
                    </td>
                    <td className="px-3 py-2.5" style={{ color: "var(--fg2)" }}>
                      {s.filename?.split(".").pop()?.toUpperCase() || "—"}
                      <span className="ml-1 text-[11px]" style={{ color: "var(--fg3)" }}>
                        {fmtBytes(s.file_size)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={s.status} synced={s.cortex_synced} />
                      {s.status === "rejected" && s.rejected_reason && (
                        <div className="mt-0.5 max-w-[180px] truncate text-[11px]" style={{ color: "var(--fg3)" }} title={s.rejected_reason}>
                          {s.rejected_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <a
                        href={`/api/library/submissions/${s.id}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[13px] underline-offset-2 hover:underline"
                        style={{ color: "var(--accent)" }}
                      >
                        Open
                      </a>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2.5 text-left text-[11px] font-normal uppercase tracking-[0.08em]">
      {children}
    </th>
  );
}

function StatusBadge({
  status,
  synced,
}: {
  status?: SubmissionStatus;
  synced?: boolean;
}) {
  const map: Record<SubmissionStatus, { label: string; color: string }> = {
    pending: { label: "Pending", color: "var(--fg2)" },
    approved: {
      label: synced ? "In Collective" : "Approved",
      color: "var(--success)",
    },
    rejected: { label: "Rejected", color: "var(--fg3)" },
  };
  const s = map[status || "pending"];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: s.color }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      {s.label}
    </span>
  );
}
