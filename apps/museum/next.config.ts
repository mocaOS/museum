import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: false,
  // This app is self-contained inside the monorepo; pin the workspace root so
  // Turbopack doesn't infer the parent (which has its own bun.lock).
  turbopack: {
    root: dirname(fileURLToPath(import.meta.url)),
  },
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2"],
  async redirects() {
    return [
      { source: "/galleries", destination: "/collections", permanent: true },
      { source: "/galleries/:slug", destination: "/collections/:slug", permanent: true },
    ];
  },
  outputFileTracingIncludes: {
    "/**/*": ["./src/lib/db/migrations/**/*"],
  },
  experimental: {
    // Keep in sync with MAX_UPLOAD_BYTES in src/lib/upload-limits.ts.
    // Default is 10MB; oversized multipart bodies are silently truncated
    // by the proxy buffer and break request.formData() in route handlers.
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
