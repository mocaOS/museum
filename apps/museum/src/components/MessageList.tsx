"use client";

import { useEffect, useMemo, useRef } from "react";
import { ChatMessage, Source } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: ChatMessage[];
  onSourceClick: (source: Source) => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

export default function MessageList({
  messages,
  onSourceClick,
  emptyTitle,
  emptyDescription,
}: Props) {
  useLocale();
  const endRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
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
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto space-y-4 pb-8">
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onSourceClick={onSourceClick}
            sourceLedger={sourceLedger}
          />
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
