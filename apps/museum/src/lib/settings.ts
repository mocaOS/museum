import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";

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

export const CORTEX_ANALYTICS_VARIABLES = [
  { token: "$userEmail", description: "Logged-in user's email address" },
  { token: "$userName", description: "Logged-in user's username" },
] as const;

export type Locale = "en" | "de";

// Keys stored in the app_settings KV table.
const TEXT_KEYS = [
  "appTitle",
  "appDescription",
  "cortexAnalyticsTemplate",
  "accentColor",
  "supportUrl",
  "supportLabel",
] as const;
const LOCALE_KEY = "locale";
const LOGO_KEY = "logoFile";
const LOGO_UPDATED_KEY = "logoUpdatedAt";

export type AppSettingsKey =
  | (typeof TEXT_KEYS)[number]
  | typeof LOCALE_KEY
  | typeof LOGO_KEY
  | typeof LOGO_UPDATED_KEY;

export interface AppSettings {
  appTitle: string;
  appDescription: string;
  cortexAnalyticsTemplate: string;
  accentColor: string;
  supportUrl: string;
  supportLabel: string;
  locale: Locale;
  logoFile: string | null;
  logoUpdatedAt: number | null;
}

function normalizeLocale(raw: string | undefined): Locale {
  if (raw === "de" || raw === "german") return "de";
  return "en";
}

export function getAppSettings(): AppSettings {
  const rows = db.select().from(appSettings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const logoUpdatedRaw = map.get(LOGO_UPDATED_KEY);
  return {
    appTitle: map.get("appTitle") || DEFAULT_APP_TITLE,
    appDescription: map.get("appDescription") || DEFAULT_APP_DESCRIPTION,
    cortexAnalyticsTemplate:
      map.get("cortexAnalyticsTemplate") || DEFAULT_CORTEX_ANALYTICS_TEMPLATE,
    accentColor: map.get("accentColor") || DEFAULT_ACCENT_COLOR,
    supportUrl: map.get("supportUrl") || DEFAULT_SUPPORT_URL,
    supportLabel: map.get("supportLabel") || DEFAULT_SUPPORT_LABEL,
    locale: normalizeLocale(map.get(LOCALE_KEY)),
    logoFile: map.get(LOGO_KEY) || null,
    logoUpdatedAt: logoUpdatedRaw ? parseInt(logoUpdatedRaw, 10) : null,
  };
}

export function setTextSettings(
  patch: Partial<
    Pick<
      AppSettings,
      | "appTitle"
      | "appDescription"
      | "cortexAnalyticsTemplate"
      | "accentColor"
      | "supportUrl"
      | "supportLabel"
    >
  >
) {
  const now = Date.now();
  db.transaction((tx) => {
    for (const key of TEXT_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      if (value === "") {
        tx.delete(appSettings).where(eq(appSettings.key, key)).run();
        continue;
      }
      tx.insert(appSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}

export function setLocale(locale: Locale) {
  const now = Date.now();
  db.insert(appSettings)
    .values({ key: LOCALE_KEY, value: locale, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: locale, updatedAt: now },
    })
    .run();
}

export function setLogoFile(filename: string | null) {
  const now = Date.now();
  db.transaction((tx) => {
    if (filename === null) {
      tx.delete(appSettings)
        .where(inArray(appSettings.key, [LOGO_KEY, LOGO_UPDATED_KEY]))
        .run();
      return;
    }
    for (const [key, value] of [
      [LOGO_KEY, filename],
      [LOGO_UPDATED_KEY, String(now)],
    ] as const) {
      tx.insert(appSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value, updatedAt: now },
        })
        .run();
    }
  });
}
