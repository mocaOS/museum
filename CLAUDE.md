# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Museum of Crypto Art (MOCA) — an open-source, AI-powered museum tech stack. Turborepo monorepo with a Directus headless CMS backend, ElizaOS AI agents, Web3 integrations, and **two** web frontends.

### Frontends & domains

- **`apps/museum`** (`moca-museum`) — **Next.js 16** app. This is the **current public-facing site served at `museumofcryptoart.com`**. It renders the galleries/collections/exhibitions (live from Directus), static content (writings/timeline/incubator from `src/content/*.json`), and the **Library** — an anonymous, single-read-only-key chat front-end for the Cortex RAG backend (`library.moca.qwellco.de`). See `apps/museum/CLAUDE.md` for its full architecture. It is **self-contained** — NOT a Turborepo workspace, with its own `Dockerfile`/`docker-compose.yml`, deployed standalone on Coolify (port 3331).
- **`apps/web`** (`web`) — **Nuxt 3** frontend (Vue 3.5, TailwindCSS v4, shadcn-nuxt, TanStack Vue Query). The earlier frontend, mapped to `v2.museumofcryptoart.com` (see `packages/config`). Part of the Turborepo workspace; this is what `yarn dev:web` runs.

When someone says "the museum site" / `museumofcryptoart.com`, they mean **`apps/museum`** (Next.js).

## Agent guidance (read these)

This file is the high-level map. Detailed, current guidance lives in dedicated files —
read the one matching your task:

- **Per-app deep docs** (auto-load when you work in that app):
  - `apps/museum/CLAUDE.md` — the Next.js site + the Cortex Library (current product).
  - `apps/api/CLAUDE.md` — the Directus backend (extensions, hooks/endpoints, schema sync).
  - `apps/moca-agent/CLAUDE.md` — the ElizaOS agent system.
- **Cross-cutting references** in `.claude/docs/`:
  - `monorepo.md` — full layout, workspaces, and what's deprecated.
  - `conventions.md` — code conventions (repo-wide + per-stack).
  - `tailwind-v4.md` — Tailwind v4 reference (both frontends).
  - `deployment.md` — how everything ships.

> **Legacy note.** `apps/web` (Nuxt v2) and **R2R** are deprecated, replaced by
> `apps/museum` + **Cortex**. The old `.cursor/rules` describe that v2 stack; they are
> not the standard. Don't build new product surface on Nuxt/R2R.

## Common Commands

```bash
# Install dependencies
yarn install

# Start Docker services (PostgreSQL 17 + Redis 7)
docker-compose up -d

# Development
yarn dev              # All workspace apps (does NOT include apps/museum)
yarn dev:web          # Nuxt frontend (apps/web) + API extensions + config
yarn dev:agents       # ElizaOS agent system

# apps/museum (Next.js site at museumofcryptoart.com) — standalone, not a workspace
cd apps/museum
npm install           # its own node_modules (next@16); avoids root next@13 collision
npm run dev           # dev server on port 3331
npm run build         # production build (output: standalone)
npm start             # serve the standalone build

# Build
yarn build            # All apps via Turbo

# Deploy
yarn deploy           # Custom deployment script (deploy.js)

# API / Database
cd apps/api
npx directus start              # Start Directus API (port 8055)
npx directus-sync push          # Apply schema/config to Directus

# Scripts (Bun-based utilities)
cd apps/scripts
bun run <script-name>.ts
```

No unified test runner exists at the root. The moca-agent app has its own test setup (Bun test).

## Architecture

### Monorepo Layout

- **apps/museum** — Next.js 16 public site at `museumofcryptoart.com` (galleries + the Cortex Library). Self-contained, not a workspace; see `apps/museum/CLAUDE.md`
- **apps/web** — Nuxt 3 frontend (Vue 3.5, TailwindCSS v4, shadcn-nuxt, TanStack Vue Query), `v2.museumofcryptoart.com`
- **apps/api** — Directus 11 instance with custom extensions, PostgreSQL 17, Redis 7
- **apps/api/extensions/directus-extension-moca** — Main Directus extension (hooks + endpoints)
- **apps/api/extensions/directus-extension-raw-query** — Raw SQL query extension
- **apps/moca-agent** — ElizaOS AI agent (has its own CLAUDE.md with detailed guidance)
- **apps/scripts** — Bun-based utility scripts (CSV imports, key management)
- **apps/migration** — Legacy migration tools
- **packages/config** — Shared environment config (dev/staging/prod), imported as `@local/config`
- **packages/types** — Shared TypeScript types (directus.d.ts, opensea.d.ts, google-sheets.d.ts)
- **packages/eslint-config-custom** — Shared ESLint config

### Workspaces

Defined in root package.json: `apps/api`, `apps/api/extensions/*`, `apps/web`, `apps/moca-agent`, `packages/*`.

**`apps/museum` is intentionally NOT a workspace** — it is a self-contained Next.js app with its own lockfile and dependencies (so its `next@16` doesn't collide with `next-auth`'s `next@13` peer in `apps/web`). Install and build it standalone from inside `apps/museum` (see below), not via root `turbo`.

### Directus backend (`apps/api`)

The `directus-extension-moca` bundle adds **hooks** (`insert-opensea-data`,
`opensea-listings-sync`, `coolify-logs-sync`, plus the legacy `r2r-document-sync` /
`r2r-graph-pull`) and **endpoints** (`applications`, `codex`, `listings`). Schema/config
is version-controlled via `directus-sync` under `apps/api/directus-config/`. Full
detail — env, build, every hook/endpoint, the R2R legacy status — is in
**`apps/api/CLAUDE.md`**.

### apps/web (legacy Nuxt v2)

Maintenance only. Uses TanStack Vue Query + Directus SDK (`await suspense()` for SSR),
the `useR2R` RAG composable, shadcn-nuxt/Radix Vue, and @reown/appkit multi-chain
wallets. Its R2R Library and web3 features are **deprecated** (replaced by
`apps/museum` + Cortex). Vue conventions and the `<script setup>` ordering live in
`.claude/docs/conventions.md` under the legacy section.

## Code Conventions

Core: Bun 1.2 for the workspace (npm for standalone `apps/museum`); Node >= 22;
TypeScript 5.9+ strict, avoid `any`; naming — files/dirs kebab-case, components
PascalCase, vars/functions camelCase, constants UPPER_SNAKE_CASE, interfaces `IFooBar`,
hooks/composables `useFoo`; shared types in `packages/types`; Tailwind **v4** (specify
border/ring colors explicitly — see `.claude/docs/tailwind-v4.md`).

**Full conventions, including per-stack specifics (Next/React for `apps/museum`,
Directus, and legacy Nuxt), are in `.claude/docs/conventions.md`.**

## Environment Configuration

- **`@local/config`** (`packages/config`) — shared config object imported by web app and other packages
- **`apps/api/.env`** — Directus config (DB credentials, API keys, admin auth). Copy from `.env.example`
- **`apps/web/.env`** — Nuxt runtime config (`NUXT_PUBLIC_DIRECTUS_URL`, `R2R_*`, `REOWN_PROJECT_ID`, `NUXT_SESSION_PASSWORD`)
- **Nuxt runtime config** — server-only secrets (R2R credentials, LiteLLM, session) + public config (spread from `@local/config`)
- **`apps/museum/.env`** — Next.js site. Cortex is the only required config: `CORTEX_API_URL` + a single read-only `CORTEX_API_KEY`. Plus `DIRECTUS_URL`, `NEXT_PUBLIC_SITE_URL`, and optional branding/analytics vars. No database, no auth/superadmin env — see `apps/museum/.env.example` and `apps/museum/CLAUDE.md`.

## Deployment

- **CI/CD**: GitLab CI (`.gitlab-ci.yml`)
- **Build**: Nixpacks (`nixpacks.toml`) — Node 22, `bun install --frozen-lockfile`, `bun run build`, `bun run start`. Covers the Turborepo workspaces (Directus + Nuxt + agents).
- **`apps/museum`** deploys separately via its own `Dockerfile` (Next.js `output: standalone`, port 3331) on Coolify; point the `museumofcryptoart.com` domain at it. It has no DB volume (chat history is client-side `localStorage`).
- **Platform**: Coolify with Traefik proxy
- **Remote cache**: Turbo remote cache at `remote-cache.deploy.qwellco.de`
- **Patched deps**: `@directus/api@31.0.0` has a local patch in `patches/`

## External Services

- **Cortex** — RAG backend powering the `apps/museum` Library (`library.moca.qwellco.de`; [cortex.eco](https://cortex.eco)). Accessed via a single read-only API key through the museum app's `/api/*` proxy.
- **OpenSea API** — NFT marketplace data sync (via Directus hooks)
- **The Graph** — Blockchain data indexing
- **R2R** — RAG/semantic search for the AI Library feature in `apps/web` (Nuxt `useR2R`); the `apps/museum` Library uses Cortex instead
- **LiteLLM** — LLM proxy (optional, for chat)
- **Strapi v3** — Legacy CMS at `api.museumofcryptoart.com`
- **Reown AppKit** — Multi-chain wallet connection
- **Infisical** — Secrets management (used for agent config)
