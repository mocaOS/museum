import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import {
  isAcceptedLogoMime,
  logoExtForMime,
  MAX_LOGO_BYTES,
  saveLogo,
  deleteLogo,
} from "@/lib/branding";
import { getAppSettings, setLogoFile } from "@/lib/settings";
import { resolveLogoUrl } from "@/lib/branding-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }
  const file = form.get("logo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (!isAcceptedLogoMime(file.type)) {
    return NextResponse.json(
      { error: "Supported formats: SVG, PNG, JPEG, WebP." },
      { status: 400 }
    );
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json(
      { error: "Logo must be 1 MiB or smaller." },
      { status: 413 }
    );
  }

  const ext = logoExtForMime(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Unsupported type" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = saveLogo(buffer, ext);
  setLogoFile(filename);

  return NextResponse.json({ logoUrl: resolveLogoUrl(getAppSettings()) });
}

export async function DELETE() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  deleteLogo();
  setLogoFile(null);
  return NextResponse.json({ logoUrl: resolveLogoUrl(getAppSettings()) });
}
