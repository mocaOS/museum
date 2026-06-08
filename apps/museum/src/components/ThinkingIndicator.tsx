"use client";

import { useEffect, useState } from "react";
import { ChatMessage } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

/**
 * Pre-token "is it alive, not stuck?" indicator.
 *
 * Shown while an assistant message is streaming but no answer text has arrived
 * yet — exactly the window where the backend can be silent for several seconds
 * (search + reranking in Chat mode; LLM planning in Deep Research). It gives
 * three signals the dim three-dot placeholder never did:
 *   1. a blinking accent-color dot (motion that reads as "working"),
 *   2. a staged label that advances as real events arrive, and
 *   3. a live elapsed-seconds counter (proof time is moving, not frozen).
 */
export default function ThinkingIndicator({ message }: { message: ChatMessage }) {
  useLocale();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((performance.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Prefer the backend's authoritative status message when present (it knows
  // the real pipeline stage, including the fast-path). Otherwise fall back to
  // inferring the stage from which fields have arrived so far. Sources arriving
  // means retrieval is done and the writer is running, even before the first
  // token.
  let label: string;
  if (message.status?.message) {
    label = message.status.message;
  } else if (message.sources && message.sources.length > 0) {
    label = t("generatingResponse");
  } else if (
    (message.retrieval && message.retrieval.length > 0) ||
    (message.subQuestions && message.subQuestions.length > 0)
  ) {
    label = t("researching");
  } else if (message.thinking && message.thinking.length > 0) {
    label = t("searchingKnowledge");
  } else {
    label = t("connecting");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5 text-[var(--fg2)]">
        <span className="live-dot" aria-hidden />
        <span className="text-[13px]">{label}…</span>
        {elapsed >= 2 && (
          <span
            className="text-[11px] tabular-nums"
            style={{ fontFamily: "var(--font-mono)", color: "var(--fg3)" }}
          >
            {elapsed}s
          </span>
        )}
      </div>
      {elapsed >= 12 && (
        <span className="text-[11.5px] pl-[18px]" style={{ color: "var(--fg3)" }}>
          {t("stillWorking")}
        </span>
      )}
    </div>
  );
}
