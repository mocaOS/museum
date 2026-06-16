# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Museum of Crypto Art (MOCA) — an open-source, AI-powered museum tech stack. Turborepo monorepo with a Directus headless CMS backend, ElizaOS AI agents, Web3 integrations, and **two** web frontends.

### Frontends & domains

- **`apps/museum`** (`moca-museum`) — **Next.js 16** app. This is the **current public-facing site served at `museumofcryptoart.com`**. It renders the galleries/collections/exhibitions (live from Directus) including the **3D exhibition world builder** at `/rooms/world` (place rooms, hang/curate artworks — from the museum collections or imported from a wallet's legacy MOCA Multipass curations — save exhibits to localStorage), static content (writings/timeline/incubator from `src/content/*.json`), and the **Library** — an anonymous, single-read-only-key chat front-end for the Cortex RAG backend (`library.moca.qwellco.de`). See `apps/museum/CLAUDE.md` for its full architecture. It is **self-contained** — NOT a Turborepo workspace, with its own `Dockerfile`/`docker-compose.yml`, deployed standalone on Coolify (port 3331).
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

## QA before handover (REQUIRED for goals)

When you finish a `/goal` or any multi-step build, **spin up real QA and run the
thing before you hand it back** — do not hand over on typecheck + code-review
alone. Stand up the actual stack and exercise the feature end-to-end on the
happy path (spawn it, click it, walk into it, read the logs). Code review alone
misses runtime/engine-API mismatches — e.g. a node type that does not exist at
runtime (`app.create('model')` silently no-op'd room colliders for a whole
release). For in-world / Hyperfy or any runtime-API feature, **verify against a
running instance and tail its logs** (`apps/hyperfy/world-template` is a local
world; the spawner CLI / builder spawn into it). Only call it done after you've
*observed* it working, and say what you actually ran.

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

### apps/docs — MOCA API documentation (Zudoku)

Standalone [Zudoku](https://zudoku.dev) site documenting the **public MOCA API**
(`/v1` on the Directus backend): guides (auth, quickstart, architecture,
integration recipes) + interactive API reference generated from
`apps/docs/apis/moca-v1.json` (OpenAPI 3.1, the response-shape source of truth).
Not a workspace — `npm install && npm run build` inside `apps/docs`; ships via
its own `Dockerfile` (static nginx) on Coolify. Same framework as the Art
DeCC0s docs (docs.decc0s.com) for a consistent integrator experience. Also ships
agent-first entry points: `llms.txt` / `llms-full.txt` (Zudoku-generated) and the
**MOCA Skills** handbook (`public/SKILL.md` + `public/skills/*/SKILL.md`,
cortexskills.org-style), plus the floating Library chat widget
(`src/LibraryWidget.tsx` — localStorage-only history, ephemeral `/v1/presence`).

### apps/hyperfy — exhibitions as walkable worlds

Tooling that spawns world-builder exhibitions into self-hosted
[Hyperfy](https://github.com/hyperfy-xyz/hyperfy) v2 worlds — world URL +
admin key is all it takes. `spawn-exhibition.mjs` (CLI; no engine checkout —
`lib/protocol.mjs` speaks Hyperfy's msgpackr wire protocol, pinned to
v0.16.0) consumes the exported `*.moca-exhibition.json`; the builder's
**Spawn to Hyperfy** dialog does the same browser-side via the twins in
`apps/museum/src/lib/museum/hyperfy/` (keep the protocol/room-script twins in
sync). Each room = one Hyperfy app — artworks hang on baked slot anchors
from the export (works for un_MUSEUM `Auto_NNN` slots that never exist as
GLB nodes), curated images upload into the world as assets, `app.configure`
exposes room-level refinement props, and an embedded in-world slot editor.
**Rooms are solid**: the room GLBs carry no collider-tagged meshes (Hyperfy's
default `collision:'auto'` → walk-through), so each room script walks the loaded
model (`app.traverse`) and gives every mesh a static trimesh collider from its
own geometry (`rigidbody`+`collider{type:'geometry'}` parented to the mesh).
NB: `app.create('model')` is not a runtime node — blueprint-only component — so
the traversal is the supported path; logs `[moca] room solid — N collider(s)`.
**Native room scale**: each room carries a per-room scaling
factor (the `scale` field in the export; the base entity scale = tile-fit ×
this), pre-configured in the builder — new rooms default to **2×** — and
resizable further in-world (grab + Shift+scroll), which idempotent re-spawns
preserve (`--relayout` pushes the layout + native scale back). The slot editor
(hold E at a work) lets **scene admins** fine-place pieces with admin-gated,
world-storage-persisted adjustments. Spawns are idempotent (deterministic
ids from the exhibition id → re-spawning updates rooms in place, preserving
ALL in-world refinements) and end with a verification pass. **The museum
guide** (`--guide` / the dialog's Museum guide toggle): an agentic VRM avatar
(default `decc0.vrm` — Oblak, Art DeCC0 #2875; catalog at `apps/museum/public/avatars/`) that
visitors hold E to talk to — per-player private Q&A about the exhibition,
served by the MOCA API's public `/v1/guide/*` endpoints (context registered at
spawn, enriched from Directus). The conversation lives in a billboarded
world-space **panel** above the guide (status · question · answer · hint),
also mirrored to the visitor's private world chat — pure free-form chat, no
numbered-question picking. Answers run a **hybrid** model: a fast direct
LLM reply (`MUSEUMAGENT_*`, OpenAI-compatible — MOCA uses Venice, currently
`qwen3-5-35b-a3b`) over exhibition metadata + an aggregated MOCA brief +
per-visitor session memory, while a deterministic library router
(`needsLibrary()`) defers macro/historical/market/artist-deep-dive questions
**and persona questions about people not in the exhibition** to Cortex with a
quick in-character ack (the ack carries `consulting:true` so the guide shows a
"consulting the museum library" status until the answer lands). EVERY question's
Cortex result is then delivered via the public **`GET /v1/guide/followup`** —
extending the fast answer, or being the answer after an ack — so it gets smarter
each turn (Cortex-primary fallback + optional Art DeCC0 persona when
`MUSEUMAGENT_*` is unset). **Spatially aware:** the guide is baked with a
world-space map of the rooms + hung works (from the same slot geometry the room
apps use), resolves which room the visitor is in (tracking them as they move)
and which work they stand in front of, and sends `roomUid`+`focus` so answers
ground in the here-and-now ("which artwork is this?"). Voice via Venice TTS
(default `tts-kokoro`) speaks the WHOLE answer as back-to-back `audioUrls`
chunks (no mid-message cutoff). Script generator
twins in `lib/guide-script.mjs` /
`apps/museum/src/lib/museum/hyperfy/guide-script.ts`. The guide also ships
as a drag-droppable `.hyp` app (`build-guide-app.mjs` CLI or the dialog's
"Download guide app" button; `.hyp` builder twins `lib/hyp.mjs` /
`apps/museum/src/lib/museum/hyperfy/hyp.ts`) — no world URL/key needed,
retargetable in-world via inspector props. `world-template/` is the deployable single-world "MOCA world template"
(official engine image); `docker-compose.worlds.yml` hosts many;
`harvest-hyperfy-docs.mjs` ingests Hyperfy docs into the Library so agents
can help build worlds. See `apps/hyperfy/README.md`.

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
- **Strapi v3** — Legacy CMS at `api.museumofcryptoart.com` (powers the old
  `app.museumofcryptoart.com`). Still read live by `apps/museum`'s **Multipass
  importer** — `/users/{address}` (a wallet's curated repertoires/exhibitions)
  and `/items?id_in=…` (resolve curated works); see `apps/museum/CLAUDE.md`.
- **Reown AppKit** — Multi-chain wallet connection
- **Infisical** — Secrets management (used for agent config)
