import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: false,
  // Native/wasm deps of the GLB optimizer (/api/museum/model) must load from
  // node_modules at runtime, not be bundled — draco3dgltf reads its .wasm
  // from its own package directory.
  serverExternalPackages: [ "sharp", "draco3dgltf" ],
  // Dev only: allow opening the dev server via the machine's LAN address
  // (e.g. testing Hyperfy spawns where the world must reach this host) —
  // Next.js blocks cross-origin dev-resource requests by default.
  allowedDevOrigins: [ "192.168.68.80", "localhost" ],
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
