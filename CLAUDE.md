# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Museum of Crypto Art (MOCA) — an open-source, AI-powered museum tech stack. Turborepo monorepo with a Nuxt 3 frontend, Directus headless CMS backend, ElizaOS AI agents, and Web3 integrations.

## Common Commands

```bash
# Install dependencies
yarn install

# Start Docker services (PostgreSQL 17 + Redis 7)
docker-compose up -d

# Development
yarn dev              # All apps
yarn dev:web          # Web frontend + API extensions + config
yarn dev:agents       # ElizaOS agent system

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

- **apps/web** — Nuxt 3 frontend (Vue 3.5, TailwindCSS v4, shadcn-nuxt, TanStack Vue Query)
- **apps/api** — Directus 11 instance with custom extensions, PostgreSQL 17, Redis 7
- **apps/api/extensions/directus-extension-moca** — Main Directus extension (hooks + endpoints)
- **apps/api/extensions/directus-extension-raw-query** — Raw SQL query extension
- **apps/moca-agent** — ElizaOS AI agent (has its own CLAUDE.md with detailed guidance)
- **apps/scripts** — Bun-based utility scripts (CSV imports, R2R API key management)
- **apps/migration** — Legacy migration tools
- **packages/config** — Shared environment config (dev/staging/prod), imported as `@local/config`
- **packages/types** — Shared TypeScript types (directus.d.ts, opensea.d.ts, google-sheets.d.ts)
- **packages/eslint-config-custom** — Shared ESLint config

### Workspaces

Defined in root package.json: `apps/api`, `apps/api/extensions/*`, `apps/web`, `apps/moca-agent`, `packages/*`.

### Directus Extension Architecture

The main extension (`directus-extension-moca`) contains:
- **Hooks**: `insert-opensea-data`, `opensea-listings-sync`, `r2r-document-sync`, `r2r-graph-pull`, `coolify-logs-sync`
- **Endpoints**: `applications`, `codex`, `listings`

These hooks run as async event handlers on Directus item lifecycle events. Endpoints are custom REST routes under `/api/`.

### Data Fetching Pattern

All API calls in the web app use **TanStack Vue Query** with the Directus SDK:
```js
const { data, suspense } = useQuery({
  queryKey: ["collection", ...deps],
  queryFn: () => readItems("collection-name", { fields, filter })
});
await suspense(); // SSR compatibility
```

Key composables: `useDirectus` (Directus SDK), `useR2R` (AI search/RAG), `useSearch`, `usePagination`.

### Web3 Stack

Multi-chain wallet support via **@reown/appkit** (WalletConnect v3) with adapters for ethers.js and wagmi. Supports Ethereum and Solana. Signature-based authentication (no passwords).

## Code Conventions

- **Package manager**: Bun 1.2 (declared in packageManager field); yarn also works for workspace commands
- **Node**: >= 22
- **TypeScript**: 5.9+, strict mode, avoid `any`
- **Vue**: Composition API with `<script setup>` exclusively
- **Naming**: files/dirs kebab-case, components PascalCase, variables/functions camelCase, constants UPPER_SNAKE_CASE, interfaces `IFooBar`, composables `useFoo`
- **Imports**: Nuxt auto-imports are available (`ref`, `computed`, `watch`, `useRoute`, etc. — do not import from `vue` or `#imports`). Components are auto-imported by directory name (e.g., `App/Example/Button.vue` → `<AppExampleButton />`)
- **UI**: shadcn-nuxt components in `components/ui/`, extended with Radix Vue primitives. Use class-variance-authority (CVA) for component variants
- **Styling**: TailwindCSS v4 — use `@import "tailwindcss"` not `@tailwind` directives. Always specify border/ring colors explicitly (v4 defaults to `currentColor`). Use `@theme` directive for theme customization, `@utility` for custom utilities. CSS variable syntax: `bg-(--brand-color)` not `bg-[--brand-color]`
- **Icons**: `@nuxt/icon` with Lucide icons + custom SVGs in `svg/moca/` (prefix: `moca`)
- **Shared types**: Define in `packages/types` for cross-app reuse

### Vue Component Script Order

1. Imports (external only — not vue/nuxt auto-imports, not components)
2. `definePageMeta()`
3. Constants
4. Refs
5. Data fetching (with `await suspense()` after each query)
6. Computed properties
7. Lifecycle hooks (chronological: onBeforeMount → onMounted → watch → onBeforeUnmount → onUnmounted)
8. Methods/event handlers
9. SEO (`useHead()`, `useSeoMeta()`)

## Environment Configuration

- **`@local/config`** (`packages/config`) — shared config object imported by web app and other packages
- **`apps/api/.env`** — Directus config (DB credentials, API keys, admin auth). Copy from `.env.example`
- **`apps/web/.env`** — Nuxt runtime config (`NUXT_PUBLIC_DIRECTUS_URL`, `R2R_*`, `REOWN_PROJECT_ID`, `NUXT_SESSION_PASSWORD`)
- **Nuxt runtime config** — server-only secrets (R2R credentials, LiteLLM, session) + public config (spread from `@local/config`)

## Deployment

- **CI/CD**: GitLab CI (`.gitlab-ci.yml`)
- **Build**: Nixpacks (`nixpacks.toml`) — Node 22, `bun install --frozen-lockfile`, `bun run build`, `bun run start`
- **Platform**: Coolify with Traefik proxy
- **Remote cache**: Turbo remote cache at `remote-cache.deploy.qwellco.de`
- **Patched deps**: `@directus/api@31.0.0` has a local patch in `patches/`

## External Services

- **OpenSea API** — NFT marketplace data sync (via Directus hooks)
- **The Graph** — Blockchain data indexing
- **R2R** — RAG/semantic search for the AI Library feature
- **LiteLLM** — LLM proxy (optional, for chat)
- **Strapi v3** — Legacy CMS at `api.museumofcryptoart.com`
- **Reown AppKit** — Multi-chain wallet connection
- **Infisical** — Secrets management (used for agent config)
