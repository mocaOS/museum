"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, ErrorBanner } from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import ConfirmModal from "./ConfirmModal";

interface BackendStats {
  document_count?: number;
  chunk_count?: number;
  entity_count?: number;
  relationship_count?: number;
  community_count?: number;
  pending_task_count?: number;
  [k: string]: unknown;
}

interface StepInfo {
  status?: string;
  progress?: number;
  [k: string]: unknown;
}

interface BackendGraphStatus {
  entity_count?: number;
  within_document_relationship_count?: number;
  cross_document_relationship_count?: number;
  relationship_count?: number;
  community_count?: number;
  steps?: {
    entity_extraction?: StepInfo;
    relationship_analysis?: StepInfo;
    community_detection?: StepInfo;
    [k: string]: StepInfo | undefined;
  };
  [k: string]: unknown;
}

interface BackendTask {
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

type PhaseKey = "A" | "B" | "C";
type PhaseStatus = "idle" | "queued" | "running" | "ready" | "failed";

interface PhaseState {
  status: PhaseStatus;
  progress?: number;
  tasks: BackendTask[];
}

function classifyTask(task: BackendTask): PhaseKey | null {
  const k = `${task.kind ?? ""} ${task.type ?? ""}`.toLowerCase();
  if (!k.trim()) return null;
  if (/communit|summari[sz]/.test(k)) return "C";
  if (/relation|batch.?analy|cross.?doc/.test(k)) return "B";
  if (/entity|extract|chunk|embed|ingest|process.?doc/.test(k)) return "A";
  return null;
}

function stepStatusFrom(step?: StepInfo): PhaseStatus | null {
  const s = (step?.status || "").toLowerCase();
  if (!s) return null;
  if (["running", "processing", "in_progress"].includes(s)) return "running";
  if (["queued", "pending", "waiting"].includes(s)) return "queued";
  if (["completed", "complete", "done", "ready", "success"].includes(s))
    return "ready";
  if (["failed", "error"].includes(s)) return "failed";
  return null;
}

function computePhase(
  key: PhaseKey,
  step: StepInfo | undefined,
  allTasks: BackendTask[],
  hasOutput: boolean,
  queuedHint: boolean
): PhaseState {
  const tasks = allTasks.filter((t) => classifyTask(t) === key);
  const fromStep = stepStatusFrom(step);

  let status: PhaseStatus;
  if (tasks.length > 0 || fromStep === "running") status = "running";
  else if (fromStep === "failed") status = "failed";
  else if (fromStep === "queued" || queuedHint) status = "queued";
  else if (fromStep === "ready" || hasOutput) status = "ready";
  else status = "idle";

  const taskProgress = tasks
    .map((t) => t.progress)
    .filter((p): p is number => typeof p === "number")[0];
  const progress =
    taskProgress ?? (typeof step?.progress === "number" ? step.progress : undefined);

  return { status, progress, tasks };
}

function statusColors(status: PhaseStatus): {
  bg: string;
  fg: string;
  border: string;
} {
  switch (status) {
    case "running":
    case "queued":
      return {
        bg: "color-mix(in oklch, var(--accent) 14%, transparent)",
        fg: "var(--accent)",
        border: "color-mix(in oklch, var(--accent) 32%, transparent)",
      };
    case "ready":
      return {
        bg: "color-mix(in oklch, var(--success) 14%, transparent)",
        fg: "var(--success)",
        border: "color-mix(in oklch, var(--success) 30%, transparent)",
      };
    case "failed":
      return {
        bg: "color-mix(in oklch, var(--destructive) 14%, transparent)",
        fg: "var(--destructive)",
        border: "color-mix(in oklch, var(--destructive) 30%, transparent)",
      };
    default:
      return {
        bg: "var(--muted)",
        fg: "var(--fg2)",
        border: "var(--border)",
      };
  }
}

function statusLabel(status: PhaseStatus): string {
  return t(`phaseStatus${status.charAt(0).toUpperCase()}${status.slice(1)}` as
    | "phaseStatusIdle"
    | "phaseStatusQueued"
    | "phaseStatusRunning"
    | "phaseStatusReady"
    | "phaseStatusFailed");
}

function Kpi({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string | undefined;
  accent?: boolean;
}) {
  return (
    <div
      className="rounded-[var(--radius-lg)] border px-4 py-3"
      style={{ background: "var(--card)", borderColor: "var(--border)" }}
    >
      <div
        className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--fg2)" }}
      >
        {label}
      </div>
      <div
        className="text-[22px] font-bold"
        style={{
          color: accent ? "var(--accent)" : "var(--fg1)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: PhaseStatus }) {
  const c = statusColors(status);
  const animated = status === "running";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] px-2 py-0.5 rounded-[var(--radius-sm)] border"
      style={{
        background: c.bg,
        color: c.fg,
        borderColor: c.border,
        fontFamily: "var(--font-mono)",
      }}
    >
      <span
        className="inline-block rounded-full"
        style={{
          width: 6,
          height: 6,
          background: "currentColor",
          animation: animated ? "pulse-dot 1.2s ease-in-out infinite" : undefined,
        }}
      />
      {statusLabel(status)}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      className="h-1.5 w-full rounded-full overflow-hidden"
      style={{ background: "var(--muted)" }}
    >
      <div
        style={{
          width: `${Math.min(100, Math.max(0, value))}%`,
          background: "var(--accent)",
          height: "100%",
          transition: "width 300ms ease-out",
        }}
      />
    </div>
  );
}

function PhaseTaskList({ tasks }: { tasks: BackendTask[] }) {
  if (tasks.length === 0) return null;
  return (
    <div
      className="rounded-[var(--radius)] border divide-y"
      style={{ borderColor: "var(--border)", background: "var(--bg)" }}
    >
      {tasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-3 px-3 py-2"
        >
          <div className="flex-1 min-w-0">
            <div
              className="text-[12px] truncate"
              style={{ color: "var(--fg1)" }}
            >
              {task.kind || task.type || task.id}
            </div>
            <div
              className="text-[10.5px] truncate"
              style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
            >
              {task.id}
              {task.message ? ` · ${task.message}` : ""}
            </div>
          </div>
          {typeof task.progress === "number" && (
            <div className="w-24 shrink-0">
              <ProgressBar value={task.progress} />
              <div
                className="text-[10.5px] mt-1 text-right"
                style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
              >
                {Math.round(task.progress)}%
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function StepCard({
  stepNumber,
  title,
  description,
  phase,
  footerHint,
  children,
}: {
  stepNumber: 1 | 2 | 3;
  title: string;
  description: string;
  phase: PhaseState;
  footerHint?: string;
  children: React.ReactNode;
}) {
  const colors = statusColors(phase.status);
  return (
    <div
      className="rounded-[var(--radius-lg)] border p-5 space-y-3 flex flex-col"
      style={{
        background: "var(--card)",
        borderColor:
          phase.status === "running" || phase.status === "queued"
            ? colors.border
            : "var(--border)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.08em]"
            style={{ color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full border"
              style={{
                width: 18,
                height: 18,
                borderColor: colors.border,
                color: colors.fg,
                background: colors.bg,
              }}
            >
              {stepNumber}
            </span>
            {t("phaseStep", { n: stepNumber })}
          </div>
          <div
            className="text-[14px] font-semibold mt-2"
            style={{ color: "var(--fg1)" }}
          >
            {title}
          </div>
          <div className="text-[12.5px] mt-1" style={{ color: "var(--fg2)" }}>
            {description}
          </div>
        </div>
        <StatusPill status={phase.status} />
      </div>

      {typeof phase.progress === "number" && <ProgressBar value={phase.progress} />}

      <PhaseTaskList tasks={phase.tasks} />

      <div className="flex flex-wrap gap-2 pt-1 mt-auto">{children}</div>

      {footerHint && (
        <div
          className="text-[11.5px]"
          style={{ color: "var(--fg2)" }}
        >
          {footerHint}
        </div>
      )}
    </div>
  );
}

export default function ProcessingTab() {
  const [stats, setStats] = useState<BackendStats | null>(null);
  const [graph, setGraph] = useState<BackendGraphStatus | null>(null);
  const [tasks, setTasks] = useState<BackendTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, g, r] = await Promise.all([
        fetch("/api/admin/library/stats").then((x) => x.json()),
        fetch("/api/admin/library/graph/status").then((x) => x.json()),
        fetch("/api/admin/library/tasks?status=running&limit=20").then((x) =>
          x.json()
        ),
      ]);
      if (s.error) throw new Error(s.error);
      if (g.error) throw new Error(g.error);
      if (r.error) throw new Error(r.error);
      setStats(s);
      setGraph(g);
      setTasks(r.tasks ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pollingRef = useRef<number | null>(null);
  useEffect(() => {
    const shouldPoll =
      tasks.length > 0 ||
      (stats?.pending_task_count ?? 0) > 0 ||
      Object.values(graph?.steps ?? {}).some((s) => {
        const status = (s?.status || "").toLowerCase();
        return (
          status === "running" ||
          status === "processing" ||
          status === "in_progress" ||
          status === "queued" ||
          status === "pending"
        );
      });

    if (!shouldPoll) {
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
  }, [tasks.length, stats?.pending_task_count, graph?.steps, load]);

  const pipeline = useMemo(() => {
    const pending = stats?.pending_task_count ?? 0;
    const phaseA = computePhase(
      "A",
      graph?.steps?.entity_extraction,
      tasks,
      (stats?.entity_count ?? 0) > 0,
      pending > 0
    );
    const phaseB = computePhase(
      "B",
      graph?.steps?.relationship_analysis,
      tasks,
      (stats?.relationship_count ?? 0) > 0,
      false
    );
    const phaseC = computePhase(
      "C",
      graph?.steps?.community_detection,
      tasks,
      (stats?.community_count ?? 0) > 0,
      false
    );
    const anyRunning =
      phaseA.status === "running" ||
      phaseB.status === "running" ||
      phaseC.status === "running";
    return { phaseA, phaseB, phaseC, anyRunning };
  }, [graph, stats, tasks]);

  const unclassifiedTasks = useMemo(
    () => tasks.filter((t) => classifyTask(t) === null),
    [tasks]
  );

  async function run(
    path: string,
    busyKey: string,
    body?: unknown,
    successToast?: string
  ) {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("failedToLoad"));
      setToast(successToast ?? t("taskStarted"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setBusy(null);
    }
  }

  const { phaseA, phaseB, phaseC, anyRunning } = pipeline;
  const pendingDocs = stats?.pending_task_count ?? 0;
  const hasCommunities = (stats?.community_count ?? 0) > 0;

  // Button-level gating. Each entry: disabled? + why (for tooltip).
  const processPendingBlock =
    busy === "pending"
      ? ""
      : pendingDocs === 0 && phaseA.status !== "running"
      ? t("blockedNoPending")
      : "";
  const analyzeBlock =
    busy === "analyze"
      ? ""
      : phaseA.status === "running"
      ? t("blockedByExtraction")
      : phaseB.status === "running"
      ? t("blockedByRelationships")
      : "";
  const rebuildBlock =
    busy === "rebuild"
      ? ""
      : anyRunning
      ? t("blockedByPipelineBusy")
      : "";
  const detectBlock =
    busy === "detect"
      ? ""
      : phaseA.status === "running"
      ? t("blockedByExtraction")
      : phaseB.status === "running"
      ? t("blockedByRelationships")
      : phaseC.status === "running"
      ? t("blockedByCommunities")
      : "";
  const summarizeBlock =
    busy === "summarize"
      ? ""
      : phaseC.status === "running"
      ? t("blockedByCommunities")
      : !hasCommunities
      ? t("blockedNoCommunities")
      : "";
  const cleanupBlock =
    busy === "cleanup"
      ? ""
      : anyRunning
      ? t("blockedByPipelineBusy")
      : "";

  return (
    <div className="space-y-5">
      <p className="text-[13px] max-w-3xl" style={{ color: "var(--fg2)" }}>
        {t("processingDescription")}
      </p>

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

      {anyRunning && (
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
              animation: "pulse-dot 1.4s ease-in-out infinite",
            }}
          />
          {t("pipelineBusy")}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Kpi label={t("kpiDocuments")} value={stats?.document_count} />
        <Kpi label={t("kpiChunks")} value={stats?.chunk_count} />
        <Kpi label={t("kpiEntities")} value={stats?.entity_count} />
        <Kpi
          label={t("kpiRelationships")}
          value={stats?.relationship_count}
        />
        <Kpi label={t("kpiCommunities")} value={stats?.community_count} />
        <Kpi
          label={t("kpiPendingTasks")}
          value={stats?.pending_task_count}
          accent={(stats?.pending_task_count ?? 0) > 0}
        />
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <StepCard
          stepNumber={1}
          title={t("stepExtractionTitle")}
          description={t("stepExtractionDescription")}
          phase={phaseA}
          footerHint={
            pendingDocs > 0 && phaseA.status !== "running"
              ? t("pendingDocsLabel", { count: pendingDocs })
              : undefined
          }
        >
          <Button
            onClick={() =>
              run(
                "/api/admin/library/documents/process-pending",
                "pending",
                undefined,
                t("pendingQueued")
              )
            }
            disabled={busy === "pending" || !!processPendingBlock}
            title={processPendingBlock || undefined}
          >
            {busy === "pending" ? t("processingPending") : t("processPending")}
          </Button>
        </StepCard>

        <StepCard
          stepNumber={2}
          title={t("stepRelationshipsTitle")}
          description={t("stepRelationshipsDescription")}
          phase={phaseB}
          footerHint={analyzeBlock || undefined}
        >
          <Button
            onClick={() =>
              run(
                "/api/admin/library/graph/relationships/analyze",
                "analyze",
                {}
              )
            }
            disabled={busy === "analyze" || !!analyzeBlock}
            title={analyzeBlock || undefined}
          >
            {busy === "analyze" ? t("runningAnalyze") : t("runAnalyze")}
          </Button>
          <Button
            variant="outline"
            onClick={() => setConfirmRebuild(true)}
            disabled={busy === "rebuild" || !!rebuildBlock}
            title={rebuildBlock || undefined}
          >
            {busy === "rebuild" ? t("runningAnalyze") : t("runRebuild")}
          </Button>
        </StepCard>

        <StepCard
          stepNumber={3}
          title={t("stepCommunitiesTitle")}
          description={t("stepCommunitiesDescription")}
          phase={phaseC}
          footerHint={detectBlock || summarizeBlock || undefined}
        >
          <Button
            onClick={() =>
              run("/api/admin/library/graph/communities/detect", "detect", {})
            }
            disabled={busy === "detect" || !!detectBlock}
            title={detectBlock || undefined}
          >
            {busy === "detect" ? t("detecting") : t("runDetect")}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              run(
                "/api/admin/library/graph/communities/summarize",
                "summarize"
              )
            }
            disabled={busy === "summarize" || !!summarizeBlock}
            title={summarizeBlock || undefined}
          >
            {busy === "summarize" ? t("summarizing") : t("runSummarize")}
          </Button>
        </StepCard>
      </div>

      <div
        className="rounded-[var(--radius-lg)] border p-5 space-y-3"
        style={{ background: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-3">
          <div
            className="text-[14px] font-semibold"
            style={{ color: "var(--fg1)" }}
          >
            {t("otherTasks")}
          </div>
          <Button
            variant="outline"
            onClick={() => setConfirmCleanup(true)}
            disabled={busy === "cleanup" || !!cleanupBlock}
            title={cleanupBlock || undefined}
          >
            {busy === "cleanup" ? t("deleting") : t("cleanupOrphaned")}
          </Button>
        </div>
        {unclassifiedTasks.length === 0 ? (
          <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
            {anyRunning ? t("pipelineBusy") : t("noRunningTasks")}
          </div>
        ) : (
          <PhaseTaskList tasks={unclassifiedTasks} />
        )}
      </div>

      <ConfirmModal
        open={confirmRebuild}
        title={t("rebuildConfirmTitle")}
        body={t("rebuildConfirmBody")}
        confirmLabel={t("rebuild")}
        confirmVariant="danger"
        onClose={() => setConfirmRebuild(false)}
        onConfirm={async () => {
          setConfirmRebuild(false);
          await run(
            "/api/admin/library/graph/relationships/analyze",
            "rebuild",
            { rebuild: true }
          );
        }}
      />

      <ConfirmModal
        open={confirmCleanup}
        title={t("cleanupConfirmTitle")}
        body={t("cleanupConfirmBody")}
        confirmLabel={t("cleanupOrphaned")}
        confirmVariant="primary"
        onClose={() => setConfirmCleanup(false)}
        onConfirm={async () => {
          setConfirmCleanup(false);
          await run(
            "/api/admin/library/graph/cleanup",
            "cleanup",
            undefined,
            t("cleanupQueued")
          );
        }}
      />
    </div>
  );
}
