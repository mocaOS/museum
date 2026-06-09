"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage, Source } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";
import ThinkingIndicator from "./ThinkingIndicator";

interface Props {
  message: ChatMessage;
  onSourceClick: (source: Source) => void;
}

function CitationBadge({
  index,
  source,
  onClick,
}: {
  index: number;
  source: Source;
  onClick: () => void;
}) {
  return (
    <span
      className="source-citation"
      title={source.metadata.filename}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {index}
    </span>
  );
}

// Marker that survives markdown parsing (not a link, not a comment)
const CITE_PREFIX = "\u200Bcite:";
const CITE_REGEX = /\u200Bcite:(\d+)\u200B/g;
const CITE_SPLIT = /(\u200Bcite:\d+\u200B)/g;

export default function MessageBubble({ message, onSourceClick }: Props) {
  useLocale();
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [userCollapsed, setUserCollapsed] = useState(false);
  const thinkingScrollRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === "user";

  // Auto-expand thinking while streaming, auto-collapse when done
  const thinkingCount = message.thinking?.length ?? 0;
  const isStreaming = message.isStreaming ?? false;
  useEffect(() => {
    if (isStreaming && thinkingCount > 0 && !userCollapsed) {
      setThinkingExpanded(true);
    }
    if (!isStreaming) {
      setThinkingExpanded(false);
      setUserCollapsed(false);
    }
  }, [isStreaming, thinkingCount, userCollapsed]);

  // Auto-scroll thinking steps to bottom
  useEffect(() => {
    if (thinkingScrollRef.current && isStreaming) {
      thinkingScrollRef.current.scrollTop = thinkingScrollRef.current.scrollHeight;
    }
  }, [thinkingCount, isStreaming]);

  // Replace [src_N] with zero-width-space-wrapped markers that survive markdown
  const processedContent = useMemo(() => {
    if (!message.content) return "";
    if (!message.sources?.length) return message.content;
    return message.content.replace(
      /\[src_(\d+)\]/g,
      `${CITE_PREFIX}$1\u200B`
    );
  }, [message.content, message.sources]);

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] md:max-w-[70%] rounded-2xl rounded-br-md px-4 py-2.5 text-[14px] leading-[1.55] whitespace-pre-wrap"
          style={{
            background: "var(--primary)",
            color: "var(--primary-fg)",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const hasThinking = message.thinking && message.thinking.length > 0;
  const hasSources = message.sources && message.sources.length > 0;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] md:max-w-[80%] space-y-2 w-full">
        {/* Thinking steps card */}
        {hasThinking && (
          <div
            className="rounded-[var(--radius-lg)] overflow-hidden text-xs border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <button
              onClick={() => {
                setThinkingExpanded(!thinkingExpanded);
                setUserCollapsed(thinkingExpanded);
              }}
              className="flex items-center gap-2 px-3.5 py-2.5 w-full text-left text-[var(--fg2)] hover:text-[var(--fg1)] transition-colors"
            >
              {/* Sparkle icon — accent because this represents live AI work */}
              <svg
                className="w-3.5 h-3.5 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ color: "var(--accent)" }}
              >
                <path d="M12 3l1.9 5.8L20 10l-5.8 1.9L12 18l-1.9-5.8L4 10l6.1-1.2L12 3z" />
              </svg>
              <span
                className="font-medium flex-1 uppercase tracking-[0.08em] text-[10.5px]"
                style={{ color: "var(--fg2)" }}
              >
                {isStreaming
                  ? `${t("thinking")}…`
                  : `${t("thinking")} · ${message.thinking!.length} ${t("steps")}`}
              </span>
              {isStreaming ? (
                <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg
                  className={`w-3 h-3 transition-transform ${thinkingExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </button>
            {(isStreaming && !userCollapsed || !isStreaming && thinkingExpanded) && (
              <div
                ref={thinkingScrollRef}
                className="max-h-[200px] overflow-y-auto px-3.5 pb-2.5 thinking-steps-fade"
              >
                {message.thinking!.map((step, i) => (
                  <div key={i} className="flex gap-3 py-0.5 leading-relaxed">
                    <span
                      className="text-[var(--fg3)] select-none w-4 text-right flex-shrink-0 tabular-nums"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[var(--fg2)]">{step}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sub-questions */}
        {message.subQuestions && message.subQuestions.length > 0 && (
          <div
            className="text-xs text-[var(--fg2)] rounded-[var(--radius)] px-3.5 py-2.5 border"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <span
              className="font-medium uppercase tracking-[0.08em] text-[10.5px]"
              style={{ color: "var(--fg2)" }}
            >
              {t("researchAreas")}
            </span>
            <ul className="ml-3 mt-1.5 space-y-0.5 list-disc text-[var(--fg1)]">
              {message.subQuestions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Retrieval progress */}
        {message.isStreaming && message.retrieval && message.retrieval.length > 0 && (
          <div
            className="text-xs text-[var(--fg2)] flex items-center gap-2 px-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{message.retrieval[message.retrieval.length - 1]}</span>
          </div>
        )}

        {/* Main AI answer card */}
        <div
          className={`rounded-[var(--radius-lg)] border px-4 py-3.5 text-[14.5px] leading-[1.65] ${
            !message.content && message.isStreaming ? "w-fit" : ""
          }`}
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            color: "var(--fg1)",
          }}
        >
          {message.content ? (
            <div className="markdown-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children, ...props }) => (
                    <p {...props}>
                      {injectCitations(children, message.sources || [], onSourceClick)}
                    </p>
                  ),
                  li: ({ children, ...props }) => (
                    <li {...props}>
                      {injectCitations(children, message.sources || [], onSourceClick)}
                    </li>
                  ),
                  strong: ({ children, ...props }) => (
                    <strong {...props}>
                      {injectCitations(children, message.sources || [], onSourceClick)}
                    </strong>
                  ),
                  em: ({ children, ...props }) => (
                    <em {...props}>
                      {injectCitations(children, message.sources || [], onSourceClick)}
                    </em>
                  ),
                }}
              >
                {processedContent}
              </ReactMarkdown>
            </div>
          ) : message.isStreaming ? (
            <ThinkingIndicator message={message} />
          ) : null}

          {/* Sources strip inside the answer card — MOCA pattern */}
          {hasSources && !message.isStreaming && (
            <div
              className="flex flex-wrap gap-1.5 mt-3.5 pt-3 border-t"
              style={{ borderColor: "var(--border)" }}
            >
              {message.sources!.map((source, i) => (
                <button
                  key={source.chunk_id}
                  onClick={() => onSourceClick(source)}
                  className="group inline-flex items-center gap-1.5 text-[11.5px] px-2.5 py-1 rounded-[6px] transition-colors"
                  style={{
                    background: "var(--muted)",
                    color: "var(--fg1)",
                  }}
                >
                  <span
                    className="text-[10px] leading-none"
                    style={{
                      color: "var(--fg3)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    [{i + 1}]
                  </span>
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--fg2)" }}
                  >
                    <path d="M14 2H6a2 2 0 0 0 -2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                  </svg>
                  <span className="truncate max-w-[160px]">
                    {source.metadata.filename}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function injectCitations(
  children: React.ReactNode,
  sources: Source[],
  onSourceClick: (source: Source) => void
): React.ReactNode {
  if (!children) return children;
  if (!sources.length) return children;

  const childArray = Array.isArray(children) ? children : [children];

  return childArray.flatMap((child, i) => {
    if (typeof child !== "string") return child;

    const parts = child.split(CITE_SPLIT);
    if (parts.length === 1) return child;

    return parts.map((part, j) => {
      const match = part.match(/\u200Bcite:(\d+)\u200B/);
      if (match) {
        const idx = parseInt(match[1], 10) - 1;
        const source = sources[idx];
        if (source) {
          return (
            <CitationBadge
              key={`c-${i}-${j}`}
              index={idx + 1}
              source={source}
              onClick={() => onSourceClick(source)}
            />
          );
        }
        return null;
      }
      return part || null;
    });
  });
}
