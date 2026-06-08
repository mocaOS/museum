import "server-only";
import type { AppSettings } from "./settings";

// Single source of truth for "what logo URL does the client get back".
// Either the uploaded logo (DB-backed) or empty — the client falls back to
// /logo.png in the public/ folder. To customize, upload via /admin/settings.
export function resolveLogoUrl(settings: AppSettings): string {
  if (settings.logoFile) {
    const bust = settings.logoUpdatedAt ? `?v=${settings.logoUpdatedAt}` : "";
    return `/api/branding/logo${bust}`;
  }
  return "";
}
