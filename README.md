<div align="center">
  <img src="https://github.com/mocaOS/museum/blob/main/misc/social.jpg" />
</div>

---

# The MOCA Tech Stack

At the Museum of Crypto Art (MOCA), we’ve reimagined what it means to be a Museum, bringing immersive art exhibitions, free tooling and software, high-level scholarship, and an engaging community atmosphere to a purely-online museum. MOCA is an industry leader in adapting new technologies —metaverse, blockchain, and AI— for practical application in a cultural institution.

We, however, envision a broader future, in which *any* cultural institution can deploy its own AI-powered museum. Therein, visitors can interact with curated and immersive exhibits alongside one another and alongside personalized AI agents, acting as curators and tour guides, each personalized to fit a given institution’s vibe.

Welcome to our open-source museum tech stack, and the unprecedented possibilities it presents for cultural institutions forever.

Our mission, put simply: Provide a fully-deployable museum codebase where any enthusiast, collector, or cultural body can summon a top-tier curatorial, exhibitive, architectural, and artistic museum experience with ease. We’re not just sharing software; we’re democratizing access to a new paradigm in art experience.

Find the live museum at

[https://museumofcryptoart.com](https://museumofcryptoart.com)

> **Major rebuild (2026).** The museum has been rebuilt from the ground up as a new **Next.js** experience in [`apps/museum`](apps/museum), with **The Library** — our AI knowledge engine — at its heart, now powered by **[Cortex](https://cortex.eco)** ([docs.cortex.eco](https://docs.cortex.eco)). The legacy Nuxt frontend (`apps/web`) and its R2R-based search are retained for reference but are no longer the active stack.

## The Code Base

We began working on this code base in early 2025, shipped an MVP tying our Art Collections and Library into a unified stack, and in 2026 rebuilt the public museum as a modern Next.js application. As we continue to build new features, we keep migrating legacy capabilities into the new codebase.

This codebase is designed to enable any museum to deploy our tech for themselves. Meanwhile, MOCA as an organization is able to facilitate functionalities (closely tied to $MOCA tokenomics) into their own deployment of this tech stack.

Here is a sample of what we’re offering thus far:

1. **Art Collections**: Import and organize your artworks or NFTs into the backend and categorize them into collections. Your configured art is displayed in the frontend, as the APIs serve metadata + media, i.e. images, videos, 3D models.

2. **The Library**: A public, AI-powered knowledge engine for crypto art, the collection, and Web3 culture — streaming answers with source citations, an entity/relationship knowledge graph, and a Deep Research mode. The Library is powered by **[Cortex](https://cortex.eco)**, our agentic RAG platform: documents are ingested into Cortex, which builds knowledge graphs for high-end retrieval and exposes a streaming SSE chat API. Cortex runs as its own service ([code: `mocaOS/cortex-app`](https://github.com/mocaOS/cortex-app) · [docs: docs.cortex.eco](https://docs.cortex.eco)); the museum frontend talks to it server-side and never exposes keys to the browser. *(Cortex supersedes the earlier R2R-based Library.)*

3. **MOCA ROOMs**: Originally launched in 2022, this [modular architecture](https://hackmd.io/@reneil1337/moca) enables the exhibition and transportation of entire art exhibitions across immersive worlds. Upon deployment, all CC0 MOCA ROOMs are automatically populated into your museum instance, setting the baseline for your interoperable museum architecture. The new frontend renders ROOMs as optimized 3D scenes (GLB/Draco) via react-three-fiber.

   - WIP: Building out [Hyperfy](https://github.com/hyperfy-xyz/hyperfy) integration to enable a user-friendly way to manage ROOMs—e.g. positioning and scaling NFT-display slots so exhibitions can be manipulated hassle-free, plus a novel storage-mix that combines museum backends and .hyp files to retrieve all ROOM configurations into any given world.

4. **Art DeCC0s**: Art Decc0s are 10,000 uniquely generated [CC0 PFPs](https://opensea.io/collection/art-decc0s), and the future face of agentic capabilities woven throughout the software stack. Fueled by [ElizaOS](https://github.com/elizaOS/eliza), these unique personas bridge a given museum into social media, chat applications, and virtual worlds. They are enabled with all knowledge from your Library.

   - WIP: Building the MOCA Plugin for ElizaOS and allowing Art Decc0 holders to launch agents pre-configured according to unique, generated personas.

   - TBD: Integrating into MOCA ROOMs via [Eliza3D](https://github.com/elizaOS/eliza-3d-hyperfy-starter), enabling DeCC0s to spawn in Hyperfy as interactive NPCs.

### Deploy Your Own Museum

Our technical documentation is a work in progress. As we implement and refine the features outlined in this repo (from AI-driven ROOMs to DeCC0 agents and The Library), we’ll continuously improve the docs to make every subsection clearer, more comprehensive, and easier to deploy for institutions and individuals alike. For the Library/Cortex layer specifically, see **[docs.cortex.eco](https://docs.cortex.eco)**.

This is a collaborative experiment, and we’re building the scaffolding in public. If you’re eager to dive deeper, contribute, or deploy your own museum stack, [hop into our Discord](https://discord.gg/Rs7wxUTrWV)—we’ll guide you through the maze while we write the map.

## 🏗️ Architecture

This project is a **Turborepo monorepo** containing several interconnected applications and shared packages for the MOCA ecosystem.

```
museum/ (Turborepo)
├── apps/
│   ├── museum/      ★ NEW flagship frontend — Next.js 16 museum + public Library (Cortex)
│   ├── api/           Directus 11 headless CMS (collections, NFTs, ROOMs) + custom extensions
│   ├── moca-agent/    ElizaOS AI agent (Art DeCC0 personas)
│   ├── scripts/       Bun utility scripts (imports, key management)
│   ├── web/           Legacy Nuxt 3 frontend (superseded by apps/museum)
│   └── migration/     Legacy migration tooling
└── packages/
    ├── config/        Shared env config (@local/config)
    ├── types/         Shared TypeScript types (Directus, OpenSea, …)
    └── eslint-config-custom/
```

The Library’s AI engine, **Cortex**, is a separate service (repo: [`mocaOS/cortex-app`](https://github.com/mocaOS/cortex-app)) — not part of this monorepo. `apps/museum` reaches MOCA’s Cortex instance (`https://library.moca.qwellco.de`) over HTTPS, injecting the API key server-side.

## 📋 Requirements

- **Node.js**: >= v22
- **Package Manager**: **Bun 1.2** (primary; `bun@1.2.0` is pinned in `packageManager`). `yarn` also works for workspace commands.
- **Docker & Docker Compose** (for local database/cache services)
- **NVM** (recommended)

## ⚡ Quick Setup

```bash
# 1. Start PostgreSQL 17 + Redis 7
docker-compose up -d

# 2. Install workspace dependencies
yarn install            # or: bun install

# 3. Configure & start the API (Directus)
cd apps/api
cp .env.example .env    # edit with your config
npx directus start &
npx directus-sync push  # apply schema + config

# 4. Development
yarn dev                # all workspace apps via Turbo
yarn dev:web            # legacy web frontend + API extensions + config
yarn dev:agents         # ElizaOS agent system
```

> **The new museum (`apps/museum`) runs standalone** — it is intentionally **not** a Turbo/Bun workspace member (it ships its own `Dockerfile` and `package-lock.json`). Run it on its own:
>
> ```bash
> cd apps/museum
> npm install
> cp .env.example .env   # set CORTEX_API_KEY for the Library (the site runs without it)
> npm run dev            # http://localhost:3331
> ```
>
> See [`apps/museum/README.md`](apps/museum/README.md) for its full setup, env, and deployment guide.

## 🏛️ Applications

### ★ **Museum Frontend** (`apps/museum`) — the new flagship

The public museum and the home of The Library. Browse collections, walk immersive 3D exhibitions, study the writings and crypto-art timeline, and chat with the AI Library.

**Key Features:**

- **The Library**: public, streaming Cortex chat — citations, source viewer, knowledge-graph context, Chat + Deep Research modes, conversation memory. Anonymous visitors chat via a single read-only key; community members get group-scoped keys.
- **Collections**: server-rendered browse of the permanent collection (masonry, search/filter, lightbox, curatorial essays).
- **Exhibitions**: immersive 3D ROOMs (GLB) via an optimized react-three-fiber viewer.
- **Writings / Timeline / Incubator**: curated scholarship and crypto-art history.
- **Curation side**: accounts, user groups, per-group Cortex key scoping, and document upload (auth-gated under `/admin`, `/profile`, `/upload`).

**Tech Stack:** Next.js 16 (App Router, standalone) · React 19 · TypeScript 5 · Tailwind CSS 4 · @react-three/fiber + drei + three.js · @directus/sdk · react-markdown · SQLite + Drizzle (curation accounts) · Docker. Library backend: **Cortex** ([cortex.eco](https://cortex.eco) · [docs](https://docs.cortex.eco)). Frontend lineage: grew from [`mocaOS/cortex-chat`](https://github.com/mocaOS/cortex-chat).

### ⚙️ **API Backend** (`apps/api`)

Headless CMS and API built on Directus 11 with custom MOCA extensions.

**Features:**

- **Content Management**: collections, NFTs, ROOMs, applications.
- **Custom Extensions**: MOCA-specific hooks (`insert-opensea-data`, `opensea-listings-sync`, `coolify-logs-sync`) and endpoints (`applications`, `codex`, `listings`).
- **Data Sync**: OpenSea marketplace data and The Graph indexing.
- **Web3 Authentication**: Ethereum signature-based login.

**Tech Stack:** Directus 11 · PostgreSQL 17 · Redis 7 · custom TypeScript extensions.

> Earlier R2R document/graph sync hooks live here for legacy reasons; the active Library now ingests and retrieves through **Cortex** directly.

### 🤖 **ElizaOS Agent** (`apps/moca-agent`)

The Art DeCC0 agent system — AI personas fueled by [ElizaOS](https://github.com/elizaOS/eliza), enabled with knowledge from the Library. Has its own `CLAUDE.md` with detailed guidance.

### 📜 **Utility Scripts** (`apps/scripts`)

Bun-based administrative and automation tools — CSV/NFT imports, data processing, and API-key management. Run with `bun run <script>.ts`.

## 📦 Shared Packages

- **`packages/config`** — environment-specific config (dev/staging/prod), imported as `@local/config`.
- **`packages/types`** — shared TypeScript definitions (Directus, OpenSea, Google Sheets).
- **`packages/eslint-config-custom`** — standardized ESLint config across the monorepo.

## 🚀 Development Workflows

```bash
# Build all workspace apps
yarn build              # FORCE_COLOR=1 turbo build

# Deploy (custom deployment script)
yarn deploy             # node deploy.js
```

The new `apps/museum` is built and deployed independently (see its README) — `npm run build` emitting a Next.js standalone server, shipped via its own `Dockerfile` / `docker-compose.yml` on Coolify.

### Environments

- **Development** — local with hot reload
- **Staging** — pre-production testing
- **Production** — live platform

### Database / CMS

```bash
cd apps/api
npx directus start        # Directus API (port 8055)
npx directus-sync push    # apply schema/config changes
```

## 🔧 Configuration

### `apps/api/.env` (Directus)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=moca
DB_USER=moca
DB_PASSWORD=moca

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Directus
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong_password
PUBLIC_URL=http://localhost:8055
SECRET_KEY=your_secret_key

# External APIs
OPENSEA_API_KEY=your_opensea_key
THEGRAPH_API_KEY=your_graph_key
```

### `apps/museum/.env` (new frontend + Library)

```env
# Cortex — the Library's AI engine (server-side only; never NEXT_PUBLIC_)
CORTEX_API_URL=https://library.moca.qwellco.de
CORTEX_API_KEY=cortex_ro_...        # read-only key powering the public Library

# Directus CMS (collections, NFTs, ROOMs)
DIRECTUS_URL=https://api.moca.qwellco.de

# Curation side (accounts/uploads)
SUPERADMIN_EMAIL=admin@museumofcryptoart.com
SUPERADMIN_PASSWORD=change-me
APP_ENCRYPTION_KEY=...              # openssl rand -base64 32

# SEO (build-time inlined)
NEXT_PUBLIC_SITE_URL=https://museumofcryptoart.com
```

See [`apps/museum/README.md`](apps/museum/README.md) for the complete variable reference. Cortex configuration and self-hosting are documented at **[docs.cortex.eco](https://docs.cortex.eco)**.

## 🌐 Platform Features

### Digital Art Collections
Genesis, permanent, themed, and community collections — rich metadata and media rendering for images, video, and 3D.

### Web3 Integration
Multi-chain wallet support (Ethereum, Solana) with signature-based, password-less authentication; $MOCA token information and cross-chain bridging.

### AI-Powered Features (Cortex)
- **Semantic + graph retrieval** over the MOCA archive via [Cortex](https://cortex.eco).
- **Streaming chat** with source citations and a Deep Research mode.
- **Conversation memory** for fast, context-aware follow-ups.

### Virtual Exhibitions
Immersive 3D ROOMs, interactive media across digital-art formats, and WebXR-friendly viewing.

## 🛠️ Technical Highlights

- **Turborepo** for optimized builds and remote caching.
- **Server-side key injection** — the browser never sees Cortex or admin keys; all backend traffic is proxied.
- **Standalone Next.js** deploy for the museum frontend; **Directus + PostgreSQL + Redis** for the CMS.
- **Optimized 3D** — GLB ROOMs compressed (Draco + WebP) for low-weight delivery.

## 📚 Documentation

- **Museum frontend**: [`apps/museum/README.md`](apps/museum/README.md)
- **The Library / Cortex**: [docs.cortex.eco](https://docs.cortex.eco) · [cortex.eco](https://cortex.eco)
- **API**: Directus admin panel + inline extension docs
- **Agent**: `apps/moca-agent/CLAUDE.md`

## 🤝 Contributing

1. **Code Style** — ESLint + TypeScript strict mode.
2. **Commit Standards** — conventional commits.
3. **Testing** — coverage for critical components.
4. **Documentation** — inline docs and README updates.

[Join our Discord](https://discord.gg/Rs7wxUTrWV) to contribute or deploy your own museum stack.

## 📄 License

© 2026 Museum of Crypto Art. All rights reserved.

## 🔗 Links

- **Museum**: [museumofcryptoart.com](https://museumofcryptoart.com)
- **The Library / Cortex**: [cortex.eco](https://cortex.eco) · [docs.cortex.eco](https://docs.cortex.eco)
- **Manifesto**: [MOCA Manifesto](https://museumofcryptoart.com/m%E2%97%8Bc%E2%96%B3-manifesto/)

---

*"At its core, the Museum of Crypto Art (M○C△) challenges, creates conflict, provokes. M○C△ puts forward a broad representation of perspectives meant to upend our sense of who we are. It poses two questions: 'what is art?' and 'who decides?'"*
