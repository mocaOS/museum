import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/settings";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

export const dynamic = "force-dynamic";

export function GET() {
  // Branding (accent, title, description, locale, logo) is read from the
  // environment with MOCA defaults — see src/lib/settings.ts. No DB, no admin UI.
  const settings = getAppSettings();
  return NextResponse.json({
    accentColor: settings.accentColor,
    logoUrl: settings.logoUrl,
    locale: settings.locale,
    appTitle: settings.appTitle,
    appDescription: settings.appDescription,
    supportUrl: settings.supportUrl,
    supportLabel: settings.supportLabel,
    maxUploadBytes: MAX_UPLOAD_BYTES,
  });
}
