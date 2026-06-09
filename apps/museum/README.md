# Museum of Crypto Art — Web App

The public website for the **Museum of Crypto Art (MOCA)**: browse the collections, walk immersive 3D exhibitions, study the writings and crypto-art timeline, and enter the **Library** — a live, public chat over the MOCA **[Cortex](https://cortex.eco)** knowledge engine.

Built with **Next.js 16** (App Router, standalone output), **React 19**, **Tailwind CSS 4**, **react-three-fiber** for 3D, and the MOCA Library design system. It grew out of [`cortex-chat`](https://github.com/mocaOS/cortex-chat) — the Library is that chat engine, made public and embedded into the museum.

**The Library is powered by [Cortex](https://cortex.eco)** — MOCA's agentic RAG platform (knowledge graph + streaming chat). Cortex runs as its own service ([code: `mocaOS/cortex-app`](https://github.com/mocaOS/cortex-app)); this app talks to it server-side. See **[docs.cortex.eco](https://docs.cortex.eco)** for the Cortex API, key model, and self-hosting.

- **Dev / container port:** `3331`
- **Canonical site URL:** `https://museumofcryptoart.com`
- **Cortex** — tech layer for the Library: [cortex.eco](https://cortex.eco) · docs [docs.cortex.eco](https://docs.cortex.eco) · MOCA instance `https://library.moca.qwellco.de`
- **Directus CMS:** `https://api.moca.qwellco.de`

---

## What's inside

| Route | What it is | Data source |
|---|---|---|
| `/` | Museum home — hero, featured collections (random/shuffle covers), mission | Directus |
| `/collections` · `/collections/[slug]` | Browse the permanent collection — masonry grid, search/filter, lightbox, curatorial essays | Directus |
| `/exhibitions` | Immersive 3D rooms (GLB) with an upgraded R3F viewer + fullscreen | Directus |
| `/exhibitions/world` | **Experimental** RTS-style world builder — place rooms on a grid, RTS camera + keyboard controls | Directus |
| `/writings` | Curated reading list of manifestos, papers & essays, filterable by category | Static (`src/content`) |
| `/timeline` | Crypto-art history timeline grouped by year | Static (`src/content`) |
| `/incubator` | The Incubator program and its projects | Static (`src/content`) |
| `/library` | **Public** Cortex chat — streaming answers, citations, source viewer, Deep Research | Cortex API (server proxy) |
| `/admin` · `/profile` · `/upload` · `/login` | Community **curation** side — accounts, groups, document upload (retained from cortex-chat, auth-gated) | SQLite + Cortex |

The public museum (home, collections, exhibitions, writings, timeline, library) needs **no account**. Only the curation surfaces require login.

---

## Architecture

```
 Browser
   │  (never sees any API key)
   ├─ /collections, /exhibitions ── React Server Components ──► Directus REST  (api.moca.qwellco.de)
   ├─ artwork media ───────────────────────────────────────► transform-in proxy (revives dead OpenSea URLs, optimizes)
   ├─ /writings /timeline /incubator ── static JSON in the bundle
   └─ /library ── /api/ask/stream (Nitro/Next proxy) ──► Cortex API  (library.moca.qwellco.de)
                    └─ injects X-API-Key server-side, strips gzip for SSE streaming
```

- **Cortex is reached only through the server** (`/api/ask/stream`, `/api/proxy/*`). The `X-API-Key` is injected server-side and never reaches the browser. The proxy also requests `Accept-Encoding: identity` upstream so Server-Sent Events stream token-by-token instead of being gzip-buffered.
- **The Library is public**: a single read-only key (`CORTEX_API_KEY`) powers anonymous chat across all collections (`src/lib/auth/public-key.ts`). Logged-in community members still get their group-scoped keys.
- **Galleries/exhibitions render server-side** from Directus (`src/lib/museum/directus.ts`) — SEO-friendly, no client credentials.
- **Media** (`src/lib/museum/media.ts`) routes images/videos through the transform-in proxy. Many legacy source URLs (`openseauserdata.com`) are dead at origin but cached there; raw URL is used as a fallback.

---

## Getting started

### Prerequisites
- Node.js 22+ (the repo standardizes on Node 22; the Docker image uses Node 20-alpine)
- A read-only **Cortex API key** (`cortex_ro_…`) for the Library

### Install & run (dev)

```bash
npm install
cp .env.example .env      # then fill in CORTEX_API_KEY (see below)
npm run dev               # http://localhost:3331
```

> The museum boots **without** a Cortex key — collections, exhibitions, writings and timeline all work; only the Library shows a "not configured" state until `CORTEX_API_KEY` is set.

---

## Environment variables

All config is **server-side, read at runtime** (except `NEXT_PUBLIC_*`, which are inlined at build). Copy `.env.example` → `.env`.

| Variable | Description | Default |
|---|---|---|
| `CORTEX_API_URL` | Cortex backend base URL. Server-only; the browser never calls it directly. | `https://library.moca.qwellco.de` |
| `CORTEX_API_KEY` | Read-only Cortex key (`cortex_ro_…`) powering the **public** Library across all collections. If unset, the Library is disabled (site still runs). | — |
| `BACKEND_ADMIN_API_KEY` | Optional admin-tier key for the curation side (minting per-group keys, `/admin`). Falls back to `CORTEX_API_KEY` when blank. | — |
| `DIRECTUS_URL` | Directus CMS base URL (collections, NFTs, rooms). | `https://api.moca.qwellco.de` |
| `IPFS_GATEWAY` | Gateway for `ipfs://` media URIs. | `https://ipfs.qwellcode.de/ipfs/` |
| `NEXT_PUBLIC_SITE_URL` | Canonical base URL for SEO / OpenGraph. **Build-time inlined.** | `https://museumofcryptoart.com` |
| `SUPERADMIN_EMAIL` | Bootstraps the curation superadmin on every boot. | — |
| `SUPERADMIN_PASSWORD` | Re-hashed (argon2id) on each boot — rotate by editing env + restart. | — |
| `APP_ENCRYPTION_KEY` | 32 random bytes, base64 (`openssl rand -base64 32`). Encrypts curation keys at rest (AES-256-GCM). | — |
| `DATABASE_PATH` | SQLite file for the curation side. | `./data/museum.db` |
| `PORT` | Listen port (container). | `3331` |

> **Never** prefix `CORTEX_API_KEY`, `BACKEND_ADMIN_API_KEY`, `APP_ENCRYPTION_KEY`, or `SUPERADMIN_*` with `NEXT_PUBLIC_` — they must stay on the server.

---

## Build & run (production)

This app uses Next's **`output: "standalone"`**, so `next start` does **not** apply. Run the standalone server directly:

```bash
npm run build
# the build emits .next/standalone/server.js (+ traced node_modules)
PORT=3331 node --env-file=.env .next/standalone/server.js
```

For container/managed-platform deploys, use Docker (below) — its `CMD` is `node server.js`.

---

## Docker

A multi-stage `Dockerfile` builds the standalone output and runs it as a non-root user; `/app/data` (SQLite + uploads) is a volume. The image listens on **3331**.

```bash
docker build -t moca-museum .

docker run -p 3331:3331 \
  -e CORTEX_API_URL=https://library.moca.qwellco.de \
  -e CORTEX_API_KEY=cortex_ro_your_key \
  -e DIRECTUS_URL=https://api.moca.qwellco.de \
  -e NEXT_PUBLIC_SITE_URL=https://museumofcryptoart.com \
  -e SUPERADMIN_EMAIL=admin@museumofcryptoart.com \
  -e SUPERADMIN_PASSWORD=change-me \
  -e APP_ENCRYPTION_KEY="$(openssl rand -base64 32)" \
  -v moca-museum-data:/app/data \
  moca-museum
```

> `NEXT_PUBLIC_SITE_URL` only affects canonical/OG metadata and is inlined at build — set it at build time if you need a non-default value baked in; the runtime default is `museumofcryptoart.com`.

### docker-compose

`docker-compose.yml` is the deployment target for managed platforms. It builds the image, maps `${PORT:-3331}:3331`, persists `/app/data` in the named volume `moca-museum-data`, and passes the env through.

```bash
docker compose up -d --build
```

---

## Deploy on Coolify / Dokploy

Both deploy the `docker-compose.yml` unchanged.

1. **Create a Docker Compose resource** pointing at this repo, with the build context set to `apps/museum` (this app is self-contained inside the monorepo — it is *not* a bun workspace member and ships its own `Dockerfile`).
2. **Set environment variables** (all runtime):

   | Variable | Value |
   |---|---|
   | `CORTEX_API_URL` | `https://library.moca.qwellco.de` |
   | `CORTEX_API_KEY` | your `cortex_ro_…` key |
   | `DIRECTUS_URL` | `https://api.moca.qwellco.de` |
   | `IPFS_GATEWAY` | `https://ipfs.qwellcode.de/ipfs/` |
   | `NEXT_PUBLIC_SITE_URL` | your public domain (e.g. `https://museumofcryptoart.com`) |
   | `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | curation superadmin bootstrap |
   | `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` |
   | `PORT` | `3331` (optional; the compose default) |

3. **Port:** the container exposes **3331** — point the platform's proxy/domain at it. Add your domain (e.g. `museumofcryptoart.com`) in the platform; Traefik/Coolify terminates TLS.
4. **Persistence:** keep the `moca-museum-data` named volume so curation accounts/uploads survive redeploys. (The public museum is stateless — it reads Directus + Cortex live.)
5. **Deploy.** First boot runs DB migrations and bootstraps the superadmin. The public site is immediately live; the Library activates as soon as `CORTEX_API_KEY` is present.

> The `NEXT_PUBLIC_SITE_URL` is build-time inlined. On Coolify, set it as a build variable (or rely on the `museumofcryptoart.com` default) if the canonical domain matters for SEO/OG.

---

## Content management

- **Collections, NFTs, rooms** are live from **Directus** (`api.moca.qwellco.de`) — edit them in the CMS and they appear immediately (pages are `force-dynamic`).
- **Writings, Timeline, Incubator** are **static JSON** committed under `src/content/` (`writings.json`, `timeline.json`, `incubator.json`). They were aggregated from the legacy museumofcryptoart.com site. To update, edit the JSON (or re-scrape) and redeploy. Team content is intentionally omitted.
- **3D model optimization:** room GLBs are 2.6–20 MB. `scripts/optimize-rooms.mjs` downloads each and runs `gltf-transform optimize` (Draco + WebP) to produce low-weight derivatives; the R3F loader already decodes Draco/Meshopt, so optimized models drop in unchanged. Run with `node scripts/optimize-rooms.mjs [--limit N]`.

---

## Curation / admin side

The multi-tenant auth + admin system from `cortex-chat` is retained behind `/admin`, `/profile`, `/upload` (gated by `src/middleware.ts`). It backs community accounts, per-group Cortex key scoping, and document upload. SQLite lives under `/app/data`. See the inline docs in `src/lib/auth/` and `src/lib/backend/` for the key-minting model. For the public museum this is optional — the Library runs anonymously via `CORTEX_API_KEY`.

---

## Project structure

```
src/
├── app/
│   ├── (site)/                 # public museum chrome (SiteHeader + SiteFooter)
│   │   ├── page.tsx            # home (hero, featured, mission)
│   │   ├── collections/        # collections index + [slug] browse (Server Components)
│   │   ├── exhibitions/        # rooms + world/ (RTS builder)
│   │   ├── writings/ timeline/ incubator/   # static-content pages
│   ├── library/                # public Cortex chat (full-screen shell)
│   ├── admin/ profile/ upload/ login/       # curation side (auth-gated)
│   ├── api/
│   │   ├── ask/stream/         # SSE Cortex proxy (public-key fallback, gzip-stripped)
│   │   ├── proxy/[...path]/     # generic Cortex read proxy (collections, source docs)
│   │   └── auth/ me/ admin/ config/ branding/   # curation + config routes
│   ├── globals.css             # MOCA design tokens (OKLCh), dark-first
│   └── layout.tsx              # root (dark, metadataBase, ConfigBootstrap)
├── components/
│   ├── site/                   # SiteHeader, SiteFooter (museum nav)
│   ├── museum/                 # MediaView, CollectionCard, GalleryGrid, NftCard,
│   │   │                       #   NftLightbox, RoomsBrowser, WritingsBrowser, Pager, …
│   │   └── three/              # Room3DViewer, WorldBuilder (RTS camera), WorldClient
│   ├── ChatInput / MessageList / MessageBubble / SourceModal / Header / Sidebar …  # Library UI
│   └── admin/                  # curation dashboard primitives
├── content/                    # static JSON: writings, timeline, incubator
├── lib/
│   ├── museum/                 # directus.ts (server data layer) + media.ts (proxy, types)
│   ├── auth/                   # session, public-key, group keys, crypto (curation)
│   ├── backend/                # Cortex admin client (curation)
│   └── db/                     # SQLite + Drizzle (curation)
├── middleware.ts               # gates /admin /profile /upload + their APIs; rest is public
└── instrumentation.ts          # boot: env check, migrations, superadmin bootstrap
scripts/optimize-rooms.mjs      # GLB → low-weight derivative pipeline
```

---

## Notes & caveats

- **`openseauserdata.com` is shut down.** Affected video/image artworks are revived via the transform-in proxy (`src/lib/museum/media.ts`); raw URL is the fallback.
- **UI scale.** The app renders at native 100% (`--ui-scale: 1` in `globals.css`). The legacy 1.5 zoom broke `overflow:hidden` clipping under hover transforms.
- **Build warning** `Ecmascript file had an error` for `better-sqlite3` in the Edge runtime is benign — the curation DB only loads in the Node runtime.
- **3D is client-only.** The R3F viewer/world are dynamically imported with `ssr: false`.

## Tech stack

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · @react-three/fiber + drei + three.js · @directus/sdk · react-markdown + remark-gfm · SQLite + better-sqlite3 + Drizzle (curation) · Docker (standalone).
