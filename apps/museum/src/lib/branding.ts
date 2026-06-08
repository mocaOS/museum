import "server-only";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

const BRANDING_DIR = resolve(
  process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH, "..")
    : resolve(process.cwd(), "data"),
  "branding"
);

mkdirSync(BRANDING_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/svg+xml": "svg",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const MIME_BY_EXT: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export const MAX_LOGO_BYTES = 1 * 1024 * 1024; // 1 MiB

export function isAcceptedLogoMime(mime: string): boolean {
  return mime in EXT_BY_MIME;
}

export function logoExtForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

// Remove every file starting with `logo.` — we only keep one active logo.
function removeExistingLogos() {
  for (const file of readdirSync(BRANDING_DIR)) {
    if (file.startsWith("logo.")) {
      try {
        unlinkSync(resolve(BRANDING_DIR, file));
      } catch {
        /* ignore */
      }
    }
  }
}

export function saveLogo(buffer: Buffer, ext: string): string {
  removeExistingLogos();
  const filename = `logo.${ext}`;
  writeFileSync(resolve(BRANDING_DIR, filename), buffer);
  return filename;
}

export function deleteLogo(): void {
  removeExistingLogos();
}

export function readLogo(
  path: string
): { buffer: Buffer; mime: string } | null {
  const full = resolve(BRANDING_DIR, path);
  if (!full.startsWith(BRANDING_DIR) || !existsSync(full)) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  return { buffer: readFileSync(full), mime };
}
