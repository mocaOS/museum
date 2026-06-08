export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Back-compat: LIBRARY_API_URL and NEXT_PUBLIC_API_URL were renamed to
  // CORTEX_API_URL (server-only — the browser never calls the backend directly,
  // so a NEXT_PUBLIC_ prefix was a misnomer). Mirror the deprecated names onto
  // the new one so the rest of the codebase can read CORTEX_API_URL exclusively.
  if (!process.env.CORTEX_API_URL && process.env.LIBRARY_API_URL) {
    process.env.CORTEX_API_URL = process.env.LIBRARY_API_URL;
    console.warn(
      "[env] LIBRARY_API_URL is deprecated; please rename to CORTEX_API_URL."
    );
  }
  if (!process.env.CORTEX_API_URL && process.env.NEXT_PUBLIC_API_URL) {
    process.env.CORTEX_API_URL = process.env.NEXT_PUBLIC_API_URL;
    console.warn(
      "[env] NEXT_PUBLIC_API_URL is deprecated; please rename to CORTEX_API_URL (server-only)."
    );
  }

  // Museum runs the Library as a public, single-key experience: CORTEX_API_KEY
  // powers anonymous chat (all collections). If no separate admin-tier key is
  // provided, reuse it for admin operations so one pasted key works end-to-end.
  if (!process.env.BACKEND_ADMIN_API_KEY && process.env.CORTEX_API_KEY) {
    process.env.BACKEND_ADMIN_API_KEY = process.env.CORTEX_API_KEY;
  }

  validateRequiredEnv();

  const { runMigrations } = await import("@/lib/db/migrate");
  const { bootstrapSuperadmin } = await import("@/lib/auth/superadmin-bootstrap");
  runMigrations();
  await bootstrapSuperadmin();
  await migrateLegacyBrandingEnv();
}

// One-time migration: when an older deploy is upgraded, copy the legacy
// branding env vars into the app_settings table on first boot if the DB has
// no value yet. After this the env vars can be removed entirely.
//
// Indirect lookup (process.env[key]) prevents Next.js from inlining the
// NEXT_PUBLIC_* read at build time — otherwise the compiled bundle would
// freeze whatever value was present during `npm run build` and ignore the
// actual runtime env in the container.
async function migrateLegacyBrandingEnv(): Promise<void> {
  const legacyAccent =
    readRuntimeEnv("ACCENT_COLOR") || readRuntimeEnv("NEXT_PUBLIC_ACCENT_COLOR");
  if (!legacyAccent) return;
  const { getAppSettings, setTextSettings, DEFAULT_ACCENT_COLOR } = await import(
    "@/lib/settings"
  );
  const current = getAppSettings();
  if (current.accentColor && current.accentColor !== DEFAULT_ACCENT_COLOR) {
    return; // operator already set it via /admin/settings — leave it.
  }
  setTextSettings({ accentColor: legacyAccent });
  console.warn(
    `[env] Migrated legacy accent color (${legacyAccent}) from env into app_settings. ` +
      "The env var can now be removed; future edits happen via /admin/settings."
  );
}

function readRuntimeEnv(key: string): string | undefined {
  return process.env[key];
}

// Fail fast on a misconfigured deploy. Each missing/invalid var produces a
// distinct error message so an operator can fix it in one pass.
function validateRequiredEnv(): void {
  const errors: string[] = [];

  // The museum boots without a Cortex key — galleries/exhibitions work
  // regardless, and the Library degrades to a "not configured" state. Warn so
  // an operator notices, but don't block startup.
  if (!process.env.CORTEX_API_KEY && !process.env.BACKEND_ADMIN_API_KEY) {
    console.warn(
      "[env] No CORTEX_API_KEY set — the Library (Cortex chat) is disabled until one is provided."
    );
  }

  const encKey = process.env.APP_ENCRYPTION_KEY;
  if (!encKey) {
    errors.push(
      "APP_ENCRYPTION_KEY is required. Generate with `openssl rand -base64 32`."
    );
  } else if (Buffer.from(encKey, "base64").length !== 32) {
    errors.push(
      "APP_ENCRYPTION_KEY must decode to 32 bytes (base64 of 32 random bytes)."
    );
  }

  if (!process.env.SUPERADMIN_EMAIL) {
    errors.push("SUPERADMIN_EMAIL is required to bootstrap the superadmin user.");
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPERADMIN_EMAIL)) {
    errors.push("SUPERADMIN_EMAIL does not look like a valid email address.");
  }

  if (!process.env.SUPERADMIN_PASSWORD) {
    errors.push("SUPERADMIN_PASSWORD is required to bootstrap the superadmin user.");
  }

  if (errors.length > 0) {
    const header =
      "[env] Cortex Chat refuses to start: required environment is missing or invalid.";
    const body = errors.map((e) => `  - ${e}`).join("\n");
    throw new Error(`${header}\n${body}`);
  }
}
