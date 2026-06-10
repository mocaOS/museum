"use client";

import { useEffect, useRef, useState } from "react";
import { ChatSession } from "@/types";
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
}: Props) {
  useLocale();
  const groups = groupSessions(sessions);

  // Deleting is irreversible (localStorage-only history), so the trash icon
  // arms on first click and deletes on the second; it disarms after 2.5 s.
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDeleteClick = (id: string) => {
    if (armedId === id) {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      setArmedId(null);
      onDeleteSession(id);
      return;
    }
    setArmedId(id);
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    armTimerRef.current = setTimeout(() => setArmedId(null), 2500);
  };
  useEffect(() => {
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    };
  }, []);

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
                        handleDeleteClick(session.id);
                      }}
                      className={`${
                        armedId === session.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      } w-6 h-6 flex-shrink-0 flex items-center justify-center rounded transition-all`}
                      style={{
                        color:
                          armedId === session.id
                            ? "var(--destructive)"
                            : "var(--fg3)",
                        background:
                          armedId === session.id
                            ? "color-mix(in oklch, var(--destructive) 15%, transparent)"
                            : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--destructive)";
                      }}
                      onMouseLeave={(e) => {
                        if (armedId !== session.id)
                          e.currentTarget.style.color = "var(--fg3)";
                      }}
                      title={
                        armedId === session.id
                          ? t("confirmDelete")
                          : t("deleteChat")
                      }
                    >
                      {armedId === session.id ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1 -2 2H8a2 2 0 0 1 -2 -2L5 6" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
