# Monorepo map

MOCA's tech stack is a Turborepo monorepo (`moca-migration`). This is the
authoritative layout as of the current codebase — it supersedes older `.cursor`
notes that described the Nuxt app as the sole frontend.

## Apps

| Path | What it is | Status |
|------|-----------|--------|
| **`apps/museum`** | **Next.js 16** app — the public site at **`museumofcryptoart.com`**. Galleries/collections/exhibitions (live from Directus), static content (`src/content/*.json`), and the **Library** (anonymous Cortex chat). | **Current.** See `apps/museum/CLAUDE.md`. |
| **`apps/api`** | **Directus 11** headless CMS — collections, NFTs, rooms, settings + custom extensions (hooks/endpoints). PostgreSQL 17 + Redis 7. | Current. See `apps/api/CLAUDE.md`. |
| **`apps/moca-agent`** | **ElizaOS** AI agent system. | Current. See `apps/moca-agent/CLAUDE.md`. |
| **`apps/web`** | **Nuxt 3** frontend (`v2.museumofcryptoart.com`). The earlier public site; its R2R-based "Library" is **deprecated** in favor of `apps/museum` + Cortex. | **Legacy v2.** Don't build new product surface here. |
| `apps/migration` | One-off legacy data-migration scripts (Strapi → Directus, etc.). | Tooling. |
| `apps/scripts` | Bun utility scripts (CSV imports, key management). | Tooling. |
| `apps/agents-bak` | Backup of an old agent app. | Ignored (`.cursorignore`). |

## Packages

| Path | What it is |
|------|-----------|
| `packages/config` | `@local/config` — env-specific config (dev/staging/prod). Imported by `apps/web` and others. |
| `packages/types` | Shared TypeScript types (`directus.d.ts`, `opensea.d.ts`, `google-sheets.d.ts`). |
| `packages/eslint-config-custom` | Shared ESLint config. |

## Workspaces

Root `package.json` workspaces: `apps/api`, `apps/api/extensions/*`, `apps/web`,
`apps/moca-agent`, `packages/*`.

**`apps/museum` is intentionally NOT a workspace.** It is a self-contained Next.js
app with its own lockfile so its `next@16` doesn't collide with the `next@13` that
`apps/web`'s `next-auth` peer pulls in. Install/build it standalone from inside
`apps/museum` (`npm install` / `npm run build`), never via root `turbo`.

## Deprecations (don't carry these forward)

- **The v2 Nuxt site (`apps/web`) + its R2R Library.** Replaced by `apps/museum` +
  Cortex. The old `.cursor` rules for Vue Query data-fetching, R2R RAG, shadcn-nuxt,
  Vue file structure, and Nuxt web3 describe this legacy stack — they are not the
  standard for new work.
- **R2R** as the Library RAG backend. The current Library backend is **Cortex**
  (`library.moca.qwellco.de`), accessed by `apps/museum` through a single read-only
  key. (Directus still has `r2r-*` sync hooks — see `apps/api/CLAUDE.md` — but they
  feed the legacy path.)

## The current product picture

```
museumofcryptoart.com  ──►  apps/museum (Next.js 16)
                              ├─ galleries/collections/exhibitions ──► Directus REST (api.moca.qwellco.de)
                              ├─ writings/timeline/incubator ──────────► static JSON in src/content/
                              └─ /library ── /api/* proxy (single key) ─► Cortex (library.moca.qwellco.de)
```
