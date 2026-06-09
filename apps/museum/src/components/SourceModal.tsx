"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Source } from "@/types";
import { fetchDocumentContent } from "@/lib/api";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface Props {
  source: Source;
  onClose: () => void;
}

export default function SourceModal({ source, onClose }: Props) {
  useLocale();
  const [fullContent, setFullContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const doc = await fetchDocumentContent(source.document_id);
        if (cancelled) return;

        const chunkContents = doc.chunks
          .sort((a, b) => a.chunk_index - b.chunk_index)
          .map((c) => c.content);
        setFullContent(chunkContents.join("\n\n"));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [source.document_id]);

  // Scroll to highlighted chunk once content loads
  useEffect(() => {
    if (fullContent && highlightRef.current) {
      setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    }
  }, [fullContent]);

  function renderContent() {
    if (loading) {
      return (
        <div
          className="flex items-center justify-center py-12 text-[13px]"
          style={{ color: "var(--fg2)" }}
        >
          <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          {t("loadingDocument")}
        </div>
      );
    }

    if (error || !fullContent) {
      return (
        <div className="markdown-content text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {source.content}
          </ReactMarkdown>
        </div>
      );
    }

    const chunkText = source.content.trim();
    const idx = fullContent.indexOf(chunkText);

    if (idx === -1) {
      return (
        <div className="markdown-content text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {fullContent}
          </ReactMarkdown>
        </div>
      );
    }

    const before = fullContent.slice(0, idx);
    const after = fullContent.slice(idx + chunkText.length);

    return (
      <>
        {before && (
          <div className="markdown-content text-sm opacity-55">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {before}
            </ReactMarkdown>
          </div>
        )}
        <div
          ref={highlightRef}
          className="markdown-content text-sm border-l-2 pl-4 py-2 my-2"
          style={{ borderColor: "var(--accent)" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {chunkText}
          </ReactMarkdown>
        </div>
        {after && (
          <div className="markdown-content text-sm opacity-55">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {after}
            </ReactMarkdown>
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "oklch(0 0 0 / 0.60)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-[var(--radius-xl)] border"
        style={{
          // 80vh compensated for --ui-scale (see globals.css zoom note).
          maxHeight: "calc(80dvh / var(--ui-scale))",
          background: "var(--popover)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-[var(--radius)] flex items-center justify-center flex-shrink-0"
              style={{
                background:
                  "color-mix(in oklch, var(--accent) 15%, transparent)",
                color: "var(--accent)",
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0 -2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
                <path d="M10 9H8" />
              </svg>
            </div>
            <div className="min-w-0">
              <h3
                className="text-[14px] font-semibold truncate"
                style={{ color: "var(--fg1)" }}
              >
                {source.metadata.filename}
              </h3>
              <p
                className="text-[11px]"
                style={{
                  color: "var(--fg2)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {t("relevance")}: {(source.score * 100).toFixed(0)}%
                {source.metadata.rerank_score !== undefined &&
                  ` · ${t("rerank")}: ${(source.metadata.rerank_score * 100).toFixed(0)}%`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 cursor-pointer transition-colors"
            style={{ color: "var(--fg2)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--fg1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--fg2)";
            }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
