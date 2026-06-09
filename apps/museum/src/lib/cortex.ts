import "server-only";

// The MOCA Library talks to a single Cortex backend with one read-only API key.
// There is no per-user/per-group key minting — the Library is a public,
// anonymous experience. Configure with CORTEX_API_URL + CORTEX_API_KEY.

// Canonical backend URL. Deprecated aliases (NEXT_PUBLIC_API_URL,
// LIBRARY_API_URL) are mirrored onto CORTEX_API_URL at boot in instrumentation.ts.
export function getCortexUrl(): string {
  return process.env.CORTEX_API_URL || "http://localhost:8000";
}

// The single read-only key injected as X-API-Key on every Cortex request.
// Returns null when unset so callers can return a clean "not configured" 503.
export function getCortexKey(): string | null {
  return process.env.CORTEX_API_KEY || null;
}
