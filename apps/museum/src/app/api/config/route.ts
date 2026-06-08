import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/settings";
import { resolveLogoUrl } from "@/lib/branding-url";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";

export function GET() {
  // Branding (accent, title, description, locale, logo) all live in the
  // app_settings table — superadmin-editable at runtime from /admin/settings.
  const settings = getAppSettings();
  return NextResponse.json({
    accentColor: settings.accentColor,
    logoUrl: resolveLogoUrl(settings),
    locale: settings.locale,
    appTitle: settings.appTitle,
    appDescription: settings.appDescription,
    supportUrl: settings.supportUrl,
    supportLabel: settings.supportLabel,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  });
}
