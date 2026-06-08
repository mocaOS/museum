"use client";

import Link from "next/link";
import { ChatSession } from "@/types";
import { CurrentUser } from "@/types/auth";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface Props {
  open: boolean;
  onClose: () => void;
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  logoUrl: string;
  currentUser?: CurrentUser | null;
  onSignOut?: () => void;
}

function timeLabel(ts: number): string {
  const now = new Date();
  const date = new Date(ts);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOf7DaysAgo = startOfToday - 7 * 86400000;

  if (ts >= startOfToday) return t("today");
  if (ts >= startOfYesterday) return t("yesterday");
  if (ts >= startOf7DaysAgo) return t("previous7Days");
  return t("older");
}

function groupSessions(sessions: ChatSession[]) {
  const groups: { label: string; sessions: ChatSession[] }[] = [];
  const map = new Map<string, ChatSession[]>();

  for (const s of sessions) {
    const label = timeLabel(s.updatedAt);
    if (!map.has(label)) {
      map.set(label, []);
      groups.push({ label, sessions: map.get(label)! });
    }
    map.get(label)!.push(s);
  }

  return groups;
}

export default function Sidebar({
  open,
  onClose,
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  logoUrl,
  currentUser,
  onSignOut,
}: Props) {
  useLocale();
  const groups = groupSessions(sessions);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 transition-opacity"
          style={{ background: "oklch(0 0 0 / 0.55)" }}
          onClick={onClose}
        />
      )}

      {/* Sidebar panel — glass per MOCA sidebar pattern */}
      <div
        className={`fixed top-0 left-0 h-full w-72 z-50 flex flex-col transition-transform duration-200 ease-out border-r ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          background: "oklch(0.17 0 0 / 0.85)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "var(--border)",
        }}
      >
        {/* Header with logo and close */}
        <div
          className="flex items-center justify-between px-4 h-14 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <img src={logoUrl} alt="Logo" className="h-6 w-auto" />
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-[var(--radius)] flex items-center justify-center text-[var(--fg2)] hover:text-[var(--fg1)] hover:bg-[var(--muted)] transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* New Chat button */}
        <div className="px-3 py-3">
          <button
            onClick={() => {
              onNewChat();
              onClose();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-[var(--radius)] border text-sm transition-colors"
            style={{
              borderColor: "var(--border)",
              color: "var(--fg1)",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
            {t("newChat")}
          </button>
        </div>

        {/* Session list */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div
                className="px-2.5 py-1.5 text-[10.5px] font-medium uppercase tracking-[0.08em]"
                style={{ color: "var(--fg3)" }}
              >
                {group.label}
              </div>
              {group.sessions.map((session) => {
                const active = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    className="group flex items-center rounded-[var(--radius)] px-2.5 py-2 cursor-pointer transition-colors"
                    style={{
                      background: active ? "var(--muted)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!active) e.currentTarget.style.background = "oklch(1 0 0 / 0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!active) e.currentTarget.style.background = "transparent";
                    }}
                    onClick={() => {
                      onSelectSession(session.id);
                      onClose();
                    }}
                  >
                    <span
                      className="flex-1 text-[13px] truncate"
                      style={{ color: active ? "var(--fg1)" : "var(--fg1)" }}
                    >
                      {session.title || t("untitledChat")}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6 flex-shrink-0 flex items-center justify-center rounded transition-all"
                      style={{ color: "var(--fg3)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--destructive)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--fg3)";
                      }}
                      title={t("deleteChat")}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
                        <path d="M19 6l-1 14a2 2 0 0 1 -2 2H8a2 2 0 0 1 -2 -2L5 6" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {currentUser && (
          <div
            className="border-t px-2 py-2 space-y-0.5"
            style={{ borderColor: "var(--border)" }}
          >
            <SidebarNavLink
              href="/profile"
              label={t("profile")}
              onNav={onClose}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M5 21v-1a7 7 0 0 1 14 0v1" />
                </svg>
              }
              rightSlot={
                <span
                  className="text-[11px] truncate max-w-[120px]"
                  style={{
                    color: "var(--fg2)",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {currentUser.username || currentUser.email}
                </span>
              }
            />
            {currentUser.canUpload && (
              <SidebarNavLink
                href="/upload"
                label={t("uploadDocuments")}
                onNav={onClose}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1 -2 2H5a2 2 0 0 1 -2 -2v-4" />
                    <path d="M17 8l-5 -5l-5 5" />
                    <path d="M12 3v12" />
                  </svg>
                }
              />
            )}
            {(currentUser.role === "superadmin" ||
              currentUser.role === "admin") && (
              <SidebarNavLink
                href="/admin"
                label={t("admin")}
                onNav={onClose}
                icon={
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                }
              />
            )}
            <button
              onClick={onSignOut}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius)] text-sm transition-colors"
              style={{ color: "var(--fg2)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--fg1)";
                e.currentTarget.style.background = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--fg2)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1 -2 -2V5a2 2 0 0 1 2 -2h4" />
                <path d="M16 17l5 -5l-5 -5" />
                <path d="M21 12H9" />
              </svg>
              <span className="flex-1 text-left">{t("signOut")}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function SidebarNavLink({
  href,
  label,
  icon,
  onNav,
  rightSlot,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  onNav?: () => void;
  rightSlot?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--radius)] text-sm transition-colors"
      style={{ color: "var(--fg1)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "var(--muted)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {rightSlot}
    </Link>
  );
}
