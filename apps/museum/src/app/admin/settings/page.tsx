"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Button,
  ErrorBanner,
  Input,
  Select,
  Textarea,
} from "@/components/admin/ui";
import { t, setLocale as setI18nLocale } from "@/lib/i18n";
import { useLocale } from "@/lib/i18n-client";

type Locale = "en" | "de";

interface AnalyticsVariable {
  token: string;
  description: string;
}

interface Settings {
  appTitle: string;
  appDescription: string;
  cortexAnalyticsTemplate: string;
  accentColor: string;
  supportUrl: string;
  supportLabel: string;
  locale: Locale;
  hasCustomLogo: boolean;
  logoUrl: string;
}

interface Defaults {
  appTitle: string;
  appDescription: string;
  cortexAnalyticsTemplate: string;
  accentColor: string;
  supportUrl: string;
  supportLabel: string;
  locale: Locale;
}

export default function AdminSettingsPage() {
  useLocale();
  const [defaults, setDefaults] = useState<Defaults | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [analyticsVariables, setAnalyticsVariables] = useState<
    AnalyticsVariable[]
  >([]);
  const [appTitle, setAppTitle] = useState("");
  const [appDescription, setAppDescription] = useState("");
  const [cortexAnalyticsTemplate, setCortexAnalyticsTemplate] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [supportUrl, setSupportUrl] = useState("");
  const [supportLabel, setSupportLabel] = useState("");
  const [locale, setLocaleState] = useState<Locale>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVariables, setShowVariables] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("failedToLoad"));
      setDefaults(data.defaults);
      setSettings(data.settings);
      setAnalyticsVariables(data.cortexAnalyticsVariables ?? []);
      setAppTitle(data.settings.appTitle);
      setAppDescription(data.settings.appDescription);
      setCortexAnalyticsTemplate(data.settings.cortexAnalyticsTemplate ?? "");
      setAccentColor(data.settings.accentColor ?? "");
      setSupportUrl(data.settings.supportUrl ?? "");
      setSupportLabel(data.settings.supportLabel ?? "");
      setLocaleState(data.settings.locale);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("failedToLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function savePatch(
    patch: Partial<{
      appTitle: string;
      appDescription: string;
      cortexAnalyticsTemplate: string;
      accentColor: string;
      supportUrl: string;
      supportLabel: string;
      locale: Locale;
    }>
  ) {
    setSaving(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("saveFailed"));
      setSettings(data.settings);
      setAppTitle(data.settings.appTitle);
      setAppDescription(data.settings.appDescription);
      setCortexAnalyticsTemplate(data.settings.cortexAnalyticsTemplate ?? "");
      setAccentColor(data.settings.accentColor ?? "");
      setSupportUrl(data.settings.supportUrl ?? "");
      setSupportLabel(data.settings.supportLabel ?? "");
      setLocaleState(data.settings.locale);
      setI18nLocale(data.settings.locale);
      if (data.settings.accentColor) {
        document.documentElement.style.setProperty(
          "--accent",
          data.settings.accentColor
        );
      }
      setMsg(t("saved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    savePatch({
      appTitle,
      appDescription,
      cortexAnalyticsTemplate,
      accentColor,
      supportUrl,
      supportLabel,
      locale,
    });
  }

  function resetText() {
    if (!confirm(t("resetTitleDescriptionConfirm"))) return;
    savePatch({ appTitle: "", appDescription: "" });
  }

  async function uploadLogo(file: File) {
    setLogoBusy(true);
    setLogoError(null);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch("/api/admin/logo", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("uploadFailed"));
      await load();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("uploadFailed"));
    } finally {
      setLogoBusy(false);
    }
  }

  async function removeLogo() {
    if (!confirm(t("removeLogoConfirm"))) return;
    setLogoBusy(true);
    setLogoError(null);
    try {
      const res = await fetch("/api/admin/logo", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t("failedToRemove"));
      }
      await load();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : t("failedToRemove"));
    } finally {
      setLogoBusy(false);
    }
  }

  const displayLogo =
    settings?.logoUrl && settings.logoUrl.length > 0
      ? settings.logoUrl
      : "/logo.png";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1
          className="text-[24px] font-bold"
          style={{ color: "var(--fg1)", letterSpacing: "-0.015em" }}
        >
          {t("settingsHeading")}
        </h1>
        <p className="text-[13px] mt-1" style={{ color: "var(--fg2)" }}>
          {t("settingsDescription")}
        </p>
      </div>

      <ErrorBanner message={error} />

      {loading || !defaults || !settings ? (
        <div className="text-[13px]" style={{ color: "var(--fg2)" }}>
          {t("loading")}
        </div>
      ) : (
        <>
          {/* Logo */}
          <section
            className="rounded-[var(--radius-lg)] border p-5 space-y-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div
              className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
              style={{ color: "var(--fg2)" }}
            >
              {t("logoLabel")}
            </div>
            <div className="flex items-center gap-4">
              <div
                className="h-16 w-40 rounded-[var(--radius)] border flex items-center justify-center overflow-hidden px-3"
                style={{
                  background: "var(--bg)",
                  borderColor: "var(--border)",
                }}
              >
                <img
                  src={displayLogo}
                  alt="Logo preview"
                  className="max-h-12 max-w-full w-auto"
                />
              </div>
              <div className="flex gap-2">
                <label
                  className={`inline-flex items-center px-3.5 py-2 rounded-[var(--radius)] text-[13px] font-medium cursor-pointer transition-all active:scale-[0.98] ${logoBusy ? "opacity-60 cursor-not-allowed" : ""}`}
                  style={{ background: "var(--muted)", color: "var(--fg1)" }}
                >
                  {t("uploadLogo")}
                  <input
                    type="file"
                    className="hidden"
                    accept="image/svg+xml,image/png,image/jpeg,image/webp"
                    disabled={logoBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {settings.hasCustomLogo && (
                  <Button
                    variant="danger"
                    onClick={removeLogo}
                    disabled={logoBusy}
                  >
                    {t("remove")}
                  </Button>
                )}
              </div>
            </div>
            <ErrorBanner message={logoError} />
            <p className="text-[11.5px]" style={{ color: "var(--fg2)" }}>
              {t("logoHint")}
            </p>
          </section>

          {/* Text + locale */}
          <form
            onSubmit={handleSubmit}
            className="rounded-[var(--radius-lg)] border p-5 space-y-4"
            style={{ background: "var(--card)", borderColor: "var(--border)" }}
          >
            <div className="block space-y-1.5">
              <label
                className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
                style={{ color: "var(--fg2)" }}
              >
                {t("accentColorLabel")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(accentColor)
                      ? accentColor
                      : "#cba236"
                  }
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="h-9 w-12 rounded-[var(--radius)] cursor-pointer border bg-transparent p-0"
                  style={{ borderColor: "var(--input)" }}
                  aria-label={t("accentColorLabel")}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  maxLength={100}
                  placeholder={defaults.accentColor}
                  className="flex-1 rounded-[var(--radius)] px-3 py-2 text-[12.5px] outline-none border"
                  style={{
                    background: "var(--bg)",
                    borderColor: "var(--input)",
                    color: "var(--fg1)",
                    fontFamily: "var(--font-mono)",
                  }}
                />
                <div
                  className="h-9 w-9 rounded-full border"
                  style={{
                    background: accentColor || defaults.accentColor,
                    borderColor: "var(--border)",
                  }}
                  aria-hidden="true"
                />
              </div>
              <p
                className="text-[11.5px]"
                style={{ color: "var(--fg2)" }}
              >
                {t("accentColorHint")}
              </p>
              <p
                className="text-[11.5px] -mt-1"
                style={{ color: "var(--fg2)" }}
              >
                {t("defaultLabel")}{" "}
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>
                  {defaults.accentColor}
                </span>
              </p>
            </div>

            <div
              className="pt-2 mt-2 border-t"
              style={{ borderColor: "var(--border)" }}
            />

            <Input
              label={t("pageTitle")}
              value={appTitle}
              onChange={(e) => setAppTitle(e.target.value)}
              maxLength={120}
              placeholder={defaults.appTitle}
            />
            <p
              className="text-[11.5px] -mt-2"
              style={{ color: "var(--fg2)" }}
            >
              {t("defaultLabel")}{" "}
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>
                {defaults.appTitle}
              </span>
            </p>

            <Textarea
              label={t("pageDescription")}
              value={appDescription}
              onChange={(e) => setAppDescription(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={defaults.appDescription}
            />
            <p
              className="text-[11.5px] -mt-2"
              style={{ color: "var(--fg2)" }}
            >
              {t("defaultLabel")}{" "}
              <span style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>
                {defaults.appDescription}
              </span>
            </p>

            <Select
              label={t("defaultLanguage")}
              value={locale}
              onChange={(e) => setLocaleState(e.target.value as Locale)}
            >
              <option value="en">{t("langEnglish")}</option>
              <option value="de">{t("langGerman")}</option>
            </Select>
            <p
              className="text-[11.5px] -mt-2"
              style={{ color: "var(--fg2)" }}
            >
              {t("localeHint")}
            </p>

            <div
              className="pt-2 mt-2 border-t"
              style={{ borderColor: "var(--border)" }}
            />

            <Input
              label={t("supportUrlLabel")}
              type="url"
              value={supportUrl}
              onChange={(e) => setSupportUrl(e.target.value)}
              maxLength={2000}
              placeholder="https://support.example.com"
            />
            <Input
              label={t("supportTooltipLabel")}
              value={supportLabel}
              onChange={(e) => setSupportLabel(e.target.value)}
              maxLength={120}
              placeholder={t("support")}
            />
            <p
              className="text-[11.5px] -mt-2"
              style={{ color: "var(--fg2)" }}
            >
              {t("supportLinkHint")}
            </p>

            <div
              className="pt-2 mt-2 border-t"
              style={{ borderColor: "var(--border)" }}
            />

            <div className="block space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[10.5px] font-medium uppercase tracking-[0.08em]"
                  style={{ color: "var(--fg2)" }}
                >
                  {t("cortexAnalyticsLabel")}
                </span>
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t("cortexAnalyticsVariablesHeading")}
                    onMouseEnter={() => setShowVariables(true)}
                    onMouseLeave={() => setShowVariables(false)}
                    onFocus={() => setShowVariables(true)}
                    onBlur={() => setShowVariables(false)}
                    className="inline-flex items-center justify-center rounded-full transition-colors"
                    style={{ color: "var(--fg2)" }}
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  </button>
                  {showVariables && analyticsVariables.length > 0 && (
                    <div
                      role="tooltip"
                      className="absolute z-10 left-5 top-0 min-w-[260px] rounded-[var(--radius-sm)] border p-3 shadow-lg"
                      style={{
                        background: "var(--card)",
                        borderColor: "var(--border)",
                      }}
                    >
                      <div
                        className="text-[10.5px] font-medium uppercase tracking-[0.08em] mb-2"
                        style={{ color: "var(--fg2)" }}
                      >
                        {t("cortexAnalyticsVariablesHeading")}
                      </div>
                      <ul className="space-y-1.5">
                        {analyticsVariables.map((v) => (
                          <li
                            key={v.token}
                            className="flex flex-col gap-0.5"
                          >
                            <span
                              className="text-[11.5px]"
                              style={{
                                fontFamily: "var(--font-mono)",
                                color: "var(--fg1)",
                              }}
                            >
                              {v.token}
                            </span>
                            <span
                              className="text-[11.5px]"
                              style={{ color: "var(--fg2)" }}
                            >
                              {v.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <textarea
                value={cortexAnalyticsTemplate}
                onChange={(e) => setCortexAnalyticsTemplate(e.target.value)}
                maxLength={4000}
                rows={6}
                placeholder={t("cortexAnalyticsPlaceholder")}
                className="w-full rounded-[var(--radius)] px-3 py-2 text-[12.5px] outline-none border transition-colors disabled:opacity-60 placeholder:text-[var(--fg3)]"
                style={{
                  background: "var(--bg)",
                  borderColor: "var(--input)",
                  color: "var(--fg1)",
                  fontFamily: "var(--font-mono)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "var(--ring)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "var(--input)";
                }}
              />
            </div>
            <p
              className="text-[11.5px] -mt-2"
              style={{ color: "var(--fg2)" }}
            >
              {t("cortexAnalyticsHint")}
            </p>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="danger"
                type="button"
                onClick={resetText}
                disabled={saving}
              >
                {t("resetTitleDescription")}
              </Button>
              <div className="flex items-center gap-3">
                <span
                  className="text-[12.5px]"
                  style={{ color: "var(--fg2)" }}
                >
                  {msg}
                </span>
                <Button type="submit" disabled={saving}>
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
