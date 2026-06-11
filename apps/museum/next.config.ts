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
  async redirects() {
    return [
      { source: "/galleries", destination: "/collections", permanent: true },
      { source: "/galleries/:slug", destination: "/collections/:slug", permanent: true },
      { source: "/exhibitions", destination: "/rooms", permanent: true },
      { source: "/exhibitions/world", destination: "/rooms/world", permanent: true },
      { source: "/exhibitions/rooms/:id", destination: "/rooms/:id", permanent: true },
    ];
  },
  experimental: {
    // Keep in sync with MAX_UPLOAD_BYTES in src/lib/upload-limits.ts.
    // Default is 10MB; oversized multipart bodies are silently truncated
    // by the proxy buffer and break request.formData() in route handlers.
    proxyClientMaxBodySize: "200mb",
  },
};

export default nextConfig;
