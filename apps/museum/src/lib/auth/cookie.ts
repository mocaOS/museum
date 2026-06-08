// Constants safe to import from both Edge (middleware) and Node runtimes.
// No Node-only imports may land in this file.
export const SESSION_COOKIE = "cortex_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
