import { setLocale, type Locale } from "./i18n";
import { MAX_UPLOAD_BYTES } from "./upload-limits";

export interface ClientConfig {
  accentColor: string;
  logoUrl: string;
  locale: string;
  appTitle: string;
  appDescription: string;
  supportUrl: string;
  supportLabel: string;
  maxUploadBytes: number;
}

let cachedConfig: ClientConfig | null = null;

// Seeded from the server-rendered layout so the first client paint already
// has the correct logo, title, locale, etc. — no flash of defaults.
export function seedConfig(cfg: ClientConfig): void {
  cachedConfig = cfg;
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--accent", cfg.accentColor);
    document.documentElement.lang = cfg.locale === "de" ? "de" : "en";
  }
  const locale: Locale = cfg.locale === "de" ? "de" : "en";
  setLocale(locale);
}

export function getCachedConfig(): ClientConfig | null {
  return cachedConfig;
}

export async function getConfig(): Promise<ClientConfig> {
  if (cachedConfig) return cachedConfig;

  try {
    const res = await fetch("/api/config");
    cachedConfig = (await res.json()) as ClientConfig;
  } catch {
    // Cosmetic fallback if /api/config itself is unreachable — at that point
    // the app is broken anyway (no auth, no chats); accent value is a stub.
    cachedConfig = {
      accentColor: "oklch(0.79 0.18 70.67)",
      logoUrl: "",
      locale: "en",
      appTitle: "Ask AI",
      appDescription:
        "Ask anything about your knowledge base. Switch to Deep Research for complex multi-step questions.",
      supportUrl: "",
      supportLabel: "",
      maxUploadBytes: MAX_UPLOAD_BYTES,
    };
  }

  document.documentElement.style.setProperty(
    "--accent",
    cachedConfig!.accentColor
  );

  const locale: Locale = cachedConfig!.locale === "de" ? "de" : "en";
  setLocale(locale);
  document.documentElement.lang = locale;

  return cachedConfig!;
}
