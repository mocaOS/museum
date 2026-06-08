"use client";

import { useEffect } from "react";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useLocale();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "oklch(0 0 0 / 0.60)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-[var(--radius-xl)] border`}
        style={{
          background: "var(--popover)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--fg1)" }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="transition-colors"
            style={{ color: "var(--fg2)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--fg1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--fg2)";
            }}
            aria-label={t("close")}
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
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div
            className="px-5 py-4 border-t flex items-center justify-end gap-2"
            style={{ borderColor: "var(--border)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
