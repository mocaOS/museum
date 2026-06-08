"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Button,
  ErrorBanner,
  Select,
  Table,
  Td,
  Th,
} from "@/components/admin/ui";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface SeriesPoint {
  day: string;
  logins: number;
  messages: number;
  uploads: number;
}

interface TopUser {
  userId: string | null;
  email: string | null;
  username: string | null;
  lastLoginAt: number | null;
  n: number;
  logins: number;
}

interface Analytics {
  days: number;
  totals: {
    logins: number;
    messages: number;
    uploads: number;
    activeUsers: number;
  };
  series: SeriesPoint[];
  topUsers: TopUser[];
}

interface LoginEventRow {
  id: string;
  createdAt: number;
  success: number;
  emailAttempted: string;
  ip: string;
  userAgent: string;
  userEmail: string | null;
  username: string | null;
}

const RANGE_VALUES = [7, 30, 90] as const;

const LOGIN_PAGE = 50;

type TabKey = "top-users" | "login-history";

export default function AdminDashboard() {
  useLocale();
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [counts, setCounts] = useState<{
    users: number;
    groups: number;
    uploaders: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("top-users");

  // Login history state (only fetched when its tab is active).
  const [logins, setLogins] = useState<LoginEventRow[]>([]);
  const [loginOffset, setLoginOffset] = useState(0);
  const [loginHasMore, setLoginHasMore] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const loadAnalytics = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const [a, u, g] = await Promise.all([
        fetch(`/api/admin/analytics?days=${d}`).then((r) => r.json()),
        fetch("/api/admin/users").then((r) => r.json()),
        fetch("/api/admin/groups").then((r) => r.json()),
      ]);
      if (a.error) throw new Error(a.error);
      setAnalytics(a);
      const users = u.users ?? [];
      setCounts({
        users: users.length,
        groups: (g.groups ?? []).length,
        uploaders: users.filter((x: { contentKeyId: string | null }) => x.contentKeyId)
          .length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLogins = useCallback(async (off: number) => {
    setLoginLoading(true);
    try {
      const res = await fetch(
        `/api/admin/login-events?limit=${LOGIN_PAGE}&offset=${off}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("failedToLoad"));
      setLogins(data.events);
      setLoginHasMore(data.events.length === LOGIN_PAGE);
      setLoginOffset(off);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoginLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnalytics(days);
  }, [days, loadAnalytics]);

  useEffect(() => {
    if (tab === "login-history" && logins.length === 0) {
      loadLogins(0);
    }
  }, [tab, logins.length, loadLogins]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-[24px] font-bold"
            style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
          >
            {t("overview")}
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--fg2)" }}>
            {t("overviewDescription")}
          </p>
        </div>
        <div className="w-48">
          <Select
            label={t("range")}
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
          >
            {RANGE_VALUES.map((v) => (
              <option key={v} value={v}>
                {v === 7
                  ? t("last7Days")
                  : v === 30
                    ? t("last30Days")
                    : t("last90Days")}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <ErrorBanner message={error} />

      {loading || !analytics || !counts ? (
        <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
          {t("loading")}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            <Kpi label={t("kpiUsers")} value={counts.users} />
            <Kpi label={t("kpiGroups")} value={counts.groups} />
            <Kpi label={t("kpiUploaders")} value={counts.uploaders} />
            <Kpi label={t("kpiActive")} value={analytics.totals.activeUsers} accent />
            <Kpi label={t("kpiLogins")} value={analytics.totals.logins} />
            <Kpi label={t("kpiMessages")} value={analytics.totals.messages} />
            <Kpi label={t("kpiUploads")} value={analytics.totals.uploads} />
          </div>

          <section
            className="rounded-[var(--radius-lg)] border p-5"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="text-[10.5px] font-medium uppercase tracking-[0.08em] mb-4"
              style={{ color: "var(--fg2)" }}
            >
              {t("dailyActivity")}
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.series}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="oklch(0.34 0 0)"
                  />
                  <XAxis
                    dataKey="day"
                    stroke="oklch(0.71 0 0)"
                    fontSize={11}
                    tickMargin={6}
                  />
                  <YAxis
                    stroke="oklch(0.71 0 0)"
                    fontSize={11}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.27 0 0)",
                      border: "1px solid oklch(0.34 0 0)",
                      borderRadius: 8,
                      color: "oklch(0.98 0 0)",
                      fontSize: 12,
                      boxShadow: "0 10px 15px oklch(0 0 0 / 0.4)",
                    }}
                    cursor={{ stroke: "oklch(0.34 0 0)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="messages"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="logins"
                    stroke="oklch(0.75 0 0)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="uploads"
                    stroke="oklch(0.55 0 0)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div
              className="flex gap-4 text-[11px] pt-3"
              style={{ color: "var(--fg2)" }}
            >
              <Legend color="var(--accent)" label={t("legendMessages")} />
              <Legend color="oklch(0.75 0 0)" label={t("legendLogins")} />
              <Legend color="oklch(0.55 0 0)" label={t("legendUploads")} />
            </div>
          </section>

          <section className="space-y-3">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { key: "top-users", label: t("tabTopUsers") },
                { key: "login-history", label: t("tabLoginHistory") },
              ]}
            />
            {tab === "top-users" ? (
              <TopUsersTable rows={analytics.topUsers} />
            ) : (
              <LoginHistoryTable
                rows={logins}
                loading={loginLoading}
                offset={loginOffset}
                hasMore={loginHasMore}
                onPage={loadLogins}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
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
        className="text-[22px] font-bold mt-1 leading-none"
        style={{
          color: accent ? "var(--accent)" : "var(--fg1)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-3 h-0.5"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function Tabs<K extends string>({
  active,
  onChange,
  tabs,
}: {
  active: K;
  onChange: (k: K) => void;
  tabs: { key: K; label: string }[];
}) {
  return (
    <div
      className="flex gap-1 border-b"
      style={{ borderColor: "var(--border)" }}
    >
      {tabs.map((tab) => {
        const on = tab.key === active;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors"
            style={{
              color: on ? "var(--fg1)" : "var(--fg2)",
              borderColor: on ? "var(--accent)" : "transparent",
              fontWeight: on ? 500 : 400,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function TopUsersTable({ rows }: { rows: TopUser[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>{t("tableUser")}</Th>
          <Th>{t("tableMessages")}</Th>
          <Th>{t("tableLogins")}</Th>
          <Th>{t("tableLastLogin")}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <Td className="text-[var(--text-secondary)]">
              {t("noMessagesInRange")}
            </Td>
            <Td>{""}</Td>
            <Td>{""}</Td>
            <Td>{""}</Td>
          </tr>
        )}
        {rows.map((u) => (
          <tr key={u.userId ?? Math.random()}>
            <Td>
              {u.email ?? (
                <span className="text-[var(--text-secondary)]">
                  {t("deletedUser")}
                </span>
              )}
              {u.username && (
                <div className="text-xs text-[var(--text-secondary)]">
                  {u.username}
                </div>
              )}
            </Td>
            <Td>{u.n}</Td>
            <Td>{u.logins}</Td>
            <Td className="whitespace-nowrap text-[var(--text-secondary)]">
              {u.lastLoginAt
                ? new Date(u.lastLoginAt).toLocaleString()
                : "—"}
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function LoginHistoryTable({
  rows,
  loading,
  offset,
  hasMore,
  onPage,
}: {
  rows: LoginEventRow[];
  loading: boolean;
  offset: number;
  hasMore: boolean;
  onPage: (off: number) => void;
}) {
  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-[var(--text-secondary)]">
          {t("loading")}
        </div>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("tableWhen")}</Th>
              <Th>{t("tableUser")}</Th>
              <Th>{t("tableResult")}</Th>
              <Th>{t("tableIp")}</Th>
              <Th>{t("tableUserAgent")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <Td className="text-[var(--text-secondary)]">
                  {t("noEvents")}
                </Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
                <Td>{""}</Td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString()}
                </Td>
                <Td>
                  {r.userEmail ?? (
                    <span className="text-[var(--text-secondary)]">
                      {r.emailAttempted}
                    </span>
                  )}
                  {r.username && (
                    <div className="text-xs text-[var(--text-secondary)]">
                      {r.username}
                    </div>
                  )}
                </Td>
                <Td>
                  {r.success ? (
                    <span
                      className="text-[11px] font-medium uppercase tracking-[0.06em]"
                      style={{ color: "var(--success)", fontFamily: "var(--font-mono)" }}
                    >
                      {t("resultOk")}
                    </span>
                  ) : (
                    <span
                      className="text-[11px] font-medium uppercase tracking-[0.06em]"
                      style={{ color: "var(--destructive)", fontFamily: "var(--font-mono)" }}
                    >
                      {t("resultFail")}
                    </span>
                  )}
                </Td>
                <Td className="text-xs text-[var(--text-secondary)]">
                  {r.ip || "—"}
                </Td>
                <Td
                  className="text-xs text-[var(--text-secondary)] max-w-[300px] truncate"
                  title={r.userAgent}
                >
                  {r.userAgent || "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--text-secondary)]">
          {rows.length === 0
            ? ""
            : t("showingRange", {
                from: offset + 1,
                to: offset + rows.length,
              })}
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => onPage(Math.max(0, offset - LOGIN_PAGE))}
            disabled={offset === 0 || loading}
          >
            {t("newer")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => onPage(offset + LOGIN_PAGE)}
            disabled={!hasMore || loading}
          >
            {t("olderBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}
