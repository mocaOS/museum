import { NextResponse } from "next/server";
import { getAppSettings } from "@/lib/settings";
import { readLogo } from "@/lib/branding";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Public endpoint (exposed on /login too) — no auth. Middleware must include
// this in PUBLIC_PATHS. Returns 404 when no custom logo is set so the client
// falls back to its bundled /logo.png default.
export async function GET() {
  const { logoFile } = getAppSettings();
  if (!logoFile) {
    return NextResponse.json({ error: "No custom logo" }, { status: 404 });
  }
  const data = readLogo(logoFile);
  if (!data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new Response(new Uint8Array(data.buffer), {
    headers: {
      "Content-Type": data.mime,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
