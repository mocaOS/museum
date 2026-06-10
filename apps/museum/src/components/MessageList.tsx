"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage, Source } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  onSourceClick: (source: Source) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Starter prompts rendered on the empty state; clicking one sends it. */
  suggestions?: string[];
  onSuggestion?: (question: string) => void;
}

// Within this distance (px) of the bottom the view counts as "pinned" and
// follows the stream; further up, the user is reading and we never yank them.
const PIN_THRESHOLD = 120;

export default function MessageList({
  messages,
  onSourceClick,
  emptyTitle,
  emptyDescription,
  suggestions,
  onSuggestion,
}: Props) {
  useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD;
    pinnedRef.current = pinned;
    setShowJump(!pinned);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    pinnedRef.current = true;
    setShowJump(false);
  }, []);

  // Follow the conversation only while pinned to the bottom — streaming tokens
  // arrive as rapid message updates, and yanking a reader who scrolled up to
  // study an earlier answer is the worst thing a chat view can do.
  const lastMessageId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (pinnedRef.current) scrollToBottom("auto");
  }, [messages, scrollToBottom]);
  // A genuinely new message (user just sent) always re-pins.
  useEffect(() => {
    if (lastMessageId) scrollToBottom("smooth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  const isStreaming = useMemo(
    () => messages.some((m) => m.isStreaming),
    [messages]
  );

  // Conversation-wide source pool keyed by `sid`, so a message can resolve
  // `[src_N]` citations that point at documents first retrieved on an earlier
  // turn. First occurrence of a `sid` wins.
  const sourceLedger = useMemo(() => {
    const ledger = new Map<string, Source>();
    for (const msg of messages) {
      for (const source of msg.sources ?? []) {
        if (source.sid && !ledger.has(source.sid)) {
          ledger.set(source.sid, source);
        }
      }
    }
    return ledger;
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cortex-logo.svg" alt="Cortex" className="mb-5 h-14 w-14" />
        <h2
          className="text-[22px] font-bold mb-1.5"
          style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
        >
          {emptyTitle || t("emptyTitle")}
        </h2>
        <p className="text-[13px] max-w-md" style={{ color: "var(--fg2)" }}>
          {emptyDescription || t("emptyDescription")}
        </p>
        {suggestions && suggestions.length > 0 && onSuggestion && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-2 max-w-xl">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => onSuggestion(q)}
                className="rounded-full border px-3.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--muted)]"
                style={{ borderColor: "var(--border)", color: "var(--fg2)" }}
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto space-y-4 pb-8">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onSourceClick={onSourceClick}
              sourceLedger={sourceLedger}
            />
          ))}
        </div>
      </div>

      {/* Jump back to the live end of the conversation */}
      {showJump && (
        <button
          onClick={() => scrollToBottom("smooth")}
          aria-label={t("jumpToLatest")}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors hover:bg-[var(--muted)]"
          style={{
            background: "oklch(0.17 0 0 / 0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: "var(--border)",
            color: "var(--fg1)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M19 12l-7 7-7-7" />
          </svg>
          {isStreaming ? `${t("generatingResponse")}…` : t("jumpToLatest")}
        </button>
      )}
    </div>
  );
}
