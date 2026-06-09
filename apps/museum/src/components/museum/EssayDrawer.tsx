"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// A slide-over panel that surfaces a collection's curatorial essay (markdown).
export default function EssayDrawer({ essay }: { essay: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-[var(--radius)] border px-4 text-sm transition-colors"
        style={{ borderColor: "var(--border)", color: "var(--fg1)" }}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
        Essay
      </button>

      {open && (
        <div className="fixed inset-0 z-[90] flex justify-end">
          <div
            className="absolute inset-0"
            style={{ background: "oklch(0 0 0 / 0.55)" }}
            onClick={() => setOpen(false)}
          />
          <aside
            className="relative flex h-full w-full max-w-md flex-col border-l"
            style={{
              background: "oklch(0.17 0 0 / 0.92)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderColor: "var(--border)",
            }}
          >
            <div
              className="flex h-14 flex-shrink-0 items-center justify-between border-b px-5"
              style={{ borderColor: "var(--border)" }}
            >
              <span
                className="text-[11px] uppercase tracking-[0.12em]"
                style={{ color: "var(--fg3)" }}
              >
                Curatorial essay
              </span>
              <button
                onClick={() => setOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)]"
                style={{ color: "var(--fg2)" }}
                aria-label="Close"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="markdown-content flex-1 overflow-y-auto px-6 py-6">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // Essay links point at external sources — open them in a new
                  // tab so the collection view stays put behind the drawer.
                  a: ({ href, children, ...props }) => {
                    const external = /^https?:\/\//i.test(href ?? "");
                    return (
                      <a
                        href={href}
                        {...(external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {essay}
              </ReactMarkdown>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
