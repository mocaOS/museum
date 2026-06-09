import "server-only";

export const DEFAULT_APP_TITLE = "MOCA Library";
export const DEFAULT_APP_DESCRIPTION =
  "Ask the Museum of Crypto Art's Library Cortex about crypto art, the collection, and Web3 culture. Switch to Deep Research for complex, multi-step questions.";
export const DEFAULT_LOCALE: Locale = "en";
export const DEFAULT_CORTEX_ANALYTICS_TEMPLATE = "";
// Support link in the chat header. Empty URL hides the button entirely;
// empty label falls back to a localized "Support" tooltip in the UI.
export const DEFAULT_SUPPORT_URL = "";
export const DEFAULT_SUPPORT_LABEL = "";
// MOCA design-system accent (warm yellow-green). Single source of truth —
// duplicated nowhere except the hardcoded client-side fetch-failure fallback.
export const DEFAULT_ACCENT_COLOR = "oklch(0.79 0.18 70.67)";
// Empty → the client falls back to /logo.svg in public/. Set LOGO_URL to an
// absolute URL to override.
export const DEFAULT_LOGO_URL = "";

export type Locale = "en" | "de";

export interface AppSettings {
  appTitle: string;
  appDescription: string;
  cortexAnalyticsTemplate: string;
  accentColor: string;
  supportUrl: string;
  supportLabel: string;
  locale: Locale;
  logoUrl: string;
}

function normalizeLocale(raw: string | undefined): Locale {
  if (raw === "de" || raw === "german") return "de";
  return "en";
}

// Branding/config is read from the environment (with sensible MOCA defaults).
// There is no admin UI or database — set these in the deploy env to customize.
export function getAppSettings(): AppSettings {
  return {
    appTitle: process.env.APP_TITLE || DEFAULT_APP_TITLE,
    appDescription: process.env.APP_DESCRIPTION || DEFAULT_APP_DESCRIPTION,
    cortexAnalyticsTemplate:
      process.env.CORTEX_ANALYTICS_TEMPLATE || DEFAULT_CORTEX_ANALYTICS_TEMPLATE,
    accentColor: process.env.ACCENT_COLOR || DEFAULT_ACCENT_COLOR,
    supportUrl: process.env.SUPPORT_URL || DEFAULT_SUPPORT_URL,
    supportLabel: process.env.SUPPORT_LABEL || DEFAULT_SUPPORT_LABEL,
    locale: normalizeLocale(process.env.LOCALE),
    logoUrl: process.env.LOGO_URL || DEFAULT_LOGO_URL,
  };
}
