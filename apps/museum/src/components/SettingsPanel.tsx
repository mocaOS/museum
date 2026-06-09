"use client";

import { Settings, Collection } from "@/types";
import { t } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

interface Props {
  settings: Settings;
  onSettingsChange: (settings: Settings) => void;
  collections: Collection[];
  onClose: () => void;
}

export default function SettingsPanel({
  settings,
  onSettingsChange,
  collections,
  onClose,
}: Props) {
  useLocale();
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bottom-24 right-4 md:right-auto md:left-1/2 md:-translate-x-1/2 md:max-w-md w-[calc(100%-2rem)] md:w-80 rounded-[var(--radius-xl)] p-5 space-y-4 border"
        style={{
          background: "var(--popover)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-[13px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--fg2)" }}
          >
            {t("settings")}
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--fg2)] hover:text-[var(--fg1)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Streaming toggle */}
        <div className="flex items-center justify-between">
          <label className="text-[13px]" style={{ color: "var(--fg1)" }}>
            {t("streamResponses")}
          </label>
          <button
            onClick={() =>
              onSettingsChange({
                ...settings,
                streaming: !settings.streaming,
              })
            }
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              background: settings.streaming ? "var(--accent)" : "var(--muted)",
            }}
          >
            <span
              className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full shadow transition-transform"
              style={{
                background: settings.streaming
                  ? "var(--accent-fg)"
                  : "var(--fg1)",
                transform: settings.streaming
                  ? "translateX(20px)"
                  : "translateX(0)",
              }}
            />
          </button>
        </div>

        {/* Collection scope */}
        <div className="space-y-1.5">
          <label
            className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
            style={{ color: "var(--fg2)" }}
          >
            {t("collectionScope")}
          </label>
          <select
            value={settings.collectionId || ""}
            onChange={(e) =>
              onSettingsChange({
                ...settings,
                collectionId: e.target.value || null,
              })
            }
            className="w-full rounded-[var(--radius)] px-3 py-2 text-[13px] outline-none border transition-colors"
            style={{
              background: "var(--bg)",
              borderColor: "var(--input)",
              color: "var(--fg1)",
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--ring)";
              e.currentTarget.style.boxShadow =
                "0 0 0 2px oklch(0.55 0 0 / 0.35)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--input)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            <option value="">{t("allCollections")}</option>
            {collections.map((col) => (
              <option key={col.id} value={col.id}>
                {col.name} ({t("docsCount", { count: col.document_count ?? 0 })})
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
