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

  // The museum boots without a Cortex key — galleries/exhibitions work
  // regardless, and the Library degrades to a "not configured" state. Warn so
  // an operator notices, but don't block startup.
  if (!process.env.CORTEX_API_KEY) {
    console.warn(
      "[env] No CORTEX_API_KEY set — the Library (Cortex chat) is disabled until one is provided."
    );
  }
}
