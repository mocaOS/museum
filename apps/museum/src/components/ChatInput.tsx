"use client";

import { useState, useRef } from "react";
import { Mode } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  isLoading: boolean;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  onSettingsClick: () => void;
  collectionName: string | null;
}

export default function ChatInput({
  onSend,
  onStop,
  isLoading,
  mode,
  onModeChange,
  onSettingsClick,
  collectionName,
}: Props) {
  useLocale();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSend = !!input.trim() && !isLoading;

  return (
    <div className="px-4 pt-3 pb-5">
      <div className="max-w-3xl mx-auto space-y-2">
        {/* Mode toggle */}
        <div className="flex items-center">
          <div
            className="inline-flex items-center rounded-full p-0.5 border"
            style={{
              background: "var(--card)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <button
              onClick={() => onModeChange("chat")}
              className={`text-xs px-3 py-1 rounded-full transition-all ${
                mode === "chat"
                  ? "font-medium"
                  : "text-[var(--fg2)] hover:text-[var(--fg1)]"
              }`}
              style={
                mode === "chat"
                  ? { background: "var(--accent)", color: "var(--accent-fg)" }
                  : undefined
              }
            >
              {t("chat")}
            </button>
            <button
              onClick={() => onModeChange("deep-research")}
              className={`text-xs px-3 py-1 rounded-full transition-all ${
                mode === "deep-research"
                  ? "font-medium"
                  : "text-[var(--fg2)] hover:text-[var(--fg1)]"
              }`}
              style={
                mode === "deep-research"
                  ? { background: "var(--accent)", color: "var(--accent-fg)" }
                  : undefined
              }
            >
              {t("deepResearch")}
            </button>
          </div>
        </div>

        {/* Glass composer row */}
        <div className="flex items-center gap-2">
          <div
            className="flex-1 flex items-center gap-1 rounded-[14px] pl-3 pr-1.5 h-11 border transition-colors focus-within:border-[var(--ring)]"
            style={{
              background: "oklch(0.15 0 0 / 0.75)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderColor: "var(--border)",
              boxShadow: "var(--shadow-xl)",
            }}
          >
            <svg
              className="w-4 h-4 text-[var(--fg2)] flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1 -2 2h-14l-4 4v-16a2 2 0 0 1 2 -2h16a2 2 0 0 1 2 2z" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === "deep-research"
                  ? t("deepResearchPlaceholder")
                  : t("askAnything")
              }
              className="flex-1 bg-transparent outline-none text-sm text-[var(--fg1)] placeholder:text-[var(--fg3)] px-2"
            />

            <span
              className="hidden sm:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-[var(--fg2)] whitespace-nowrap"
              style={{ background: "var(--muted)" }}
              title={
                collectionName
                  ? `${t("searchingInCollection")} ${collectionName}`
                  : t("searchingAllCollections")
              }
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: "var(--accent)" }}
              />
              <span className="truncate max-w-[120px]">
                {collectionName || t("allCollections")}
              </span>
            </span>

            {isLoading ? (
              <button
                onClick={onStop}
                className="flex-shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center transition-colors"
                style={{
                  background:
                    "color-mix(in oklch, var(--destructive) 18%, transparent)",
                  color: "var(--destructive)",
                }}
                title={t("stop")}
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSend}
                className="flex-shrink-0 w-8 h-8 rounded-[var(--radius-md)] flex items-center justify-center transition-all disabled:opacity-30 active:scale-[0.96]"
                style={{
                  background: canSend ? "var(--accent)" : "var(--muted)",
                  color: canSend ? "var(--accent-fg)" : "var(--fg3)",
                  boxShadow: canSend
                    ? "0 0 20px color-mix(in oklch, var(--accent) 35%, transparent)"
                    : "none",
                }}
                aria-label={t("send")}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2 11 13" />
                  <path d="M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            )}
          </div>

          <button
            onClick={onSettingsClick}
            className="flex-shrink-0 w-10 h-10 rounded-[var(--radius)] flex items-center justify-center text-[var(--fg2)] hover:text-[var(--fg1)] hover:bg-[var(--muted)] transition-colors"
            title={t("settings")}
          >
            <svg
              className="w-[18px] h-[18px]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06 .06a2 2 0 0 1 -2.83 2.83l-.06 -.06a1.65 1.65 0 0 0 -1.82 -.33 1.65 1.65 0 0 0 -1 1.51V21a2 2 0 0 1 -4 0v-.09a1.65 1.65 0 0 0 -1 -1.51 1.65 1.65 0 0 0 -1.82 .33l-.06 .06a2 2 0 0 1 -2.83 -2.83l.06 -.06a1.65 1.65 0 0 0 .33 -1.82 1.65 1.65 0 0 0 -1.51 -1H3a2 2 0 0 1 0 -4h.09a1.65 1.65 0 0 0 1.51 -1 1.65 1.65 0 0 0 -.33 -1.82l-.06 -.06a2 2 0 0 1 2.83 -2.83l.06 .06a1.65 1.65 0 0 0 1.82 .33H9a1.65 1.65 0 0 0 1 -1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82 -.33l.06 -.06a2 2 0 0 1 2.83 2.83l-.06 .06a1.65 1.65 0 0 0 -.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0 -1.51 1z" />
            </svg>
          </button>
        </div>

        {/* Scope caption (mobile) + mono caption */}
        <p
          className="text-[11px] flex items-center gap-1.5 px-1"
          style={{ fontFamily: "var(--font-mono)", color: "oklch(0.42 0 0)" }}
        >
          <svg
            className="w-3 h-3 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          {collectionName
            ? `${t("searchingInCollection")} ${collectionName}`
            : t("searchingAllCollections")}
        </p>
      </div>
    </div>
  );
}
