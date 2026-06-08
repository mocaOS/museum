// Keep MAX_UPLOAD_BYTES in sync with experimental.proxyClientMaxBodySize
// in next.config.ts. Next.js takes a human-readable string there; this
// constant is the byte-precise version used by the API and the client
// preflight check.
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
export const MAX_UPLOAD_LABEL = "200 MB";
