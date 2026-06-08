import "server-only";
import { mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AVATARS_DIR = resolve(
  process.env.DATABASE_PATH
    ? resolve(process.env.DATABASE_PATH, "..")
    : resolve(process.cwd(), "data"),
  "avatars"
);

mkdirSync(AVATARS_DIR, { recursive: true });

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MiB

export function isAcceptedMime(mime: string): boolean {
  return mime in EXT_BY_MIME;
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null;
}

function removeExisting(userId: string) {
  for (const file of readdirSync(AVATARS_DIR)) {
    if (file.startsWith(`${userId}.`)) {
      try {
        unlinkSync(resolve(AVATARS_DIR, file));
      } catch {
        /* ignore */
      }
    }
  }
}

export function saveAvatar(userId: string, buffer: Buffer, ext: string): string {
  removeExisting(userId);
  const filename = `${userId}.${ext}`;
  writeFileSync(resolve(AVATARS_DIR, filename), buffer);
  return filename;
}

export function deleteAvatar(userId: string): void {
  removeExisting(userId);
}

export function readAvatar(
  path: string
): { buffer: Buffer; mime: string } | null {
  const full = resolve(AVATARS_DIR, path);
  if (!full.startsWith(AVATARS_DIR) || !existsSync(full)) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME_BY_EXT[ext];
  if (!mime) return null;
  return { buffer: readFileSync(full), mime };
}
