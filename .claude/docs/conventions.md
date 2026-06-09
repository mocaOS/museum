# Code conventions

Repo-wide conventions, then per-stack specifics. (Distilled from the legacy
`.cursor/rules` and updated for the current stack — `apps/museum` is Next.js/React,
not Nuxt/Vue.)

## Repo-wide

- **Package managers:** Bun 1.2 for the workspace (yarn also works for workspace
  commands); **`apps/museum` uses npm** (standalone, see [monorepo](./monorepo.md)).
- **Node:** >= 22.
- **TypeScript:** 5.9+, strict mode. Avoid `any` — use precise types or `unknown`.
  Use inference where it stays readable.
- **Naming:** files/dirs `kebab-case`; React/Vue components `PascalCase`;
  variables/functions `camelCase`; constants `UPPER_SNAKE_CASE`; interfaces `IFooBar`;
  Vue composables / React hooks `useFoo`.
- **Shared types:** define cross-app types in `packages/types`.
- **Comments:** explain *why*, not *what*. Match the surrounding file's comment
  density and idiom. Keep them current with the code. Use `TODO`/`FIXME` with context.
- **Error handling:** `try/catch` around async work; meaningful messages; never log
  secrets, keys, or password hashes; handle loading/error/success states in UI.

## apps/museum (Next.js 16 + React 19)

- **App Router + React Server Components by default.** Add `"use client"` only when a
  component needs state, effects, refs, or browser APIs. Server components fetch from
  Directus directly; client components hit the app's own `/api/*` routes.
- **No database / no auth.** The Library is anonymous on a single read-only
  `CORTEX_API_KEY`; chat history is client-side `localStorage`. Don't reintroduce
  server sessions, accounts, or a DB. See `apps/museum/CLAUDE.md`.
- **Styling:** TailwindCSS v4 (see [tailwind-v4](./tailwind-v4.md)) + CSS variables,
  dark-first. Follow the **MOCA Library design system** — read
  `apps/museum/.claude/skills/moca-library-design/README.md` (skill
  `/moca-library-design`) before building UI.
- **Determinism in render:** never seed initial render with `Math.random()` /
  `Date.now()` / locale-dependent formatting — it causes hydration mismatches. Seed
  deterministically (e.g. a hash of a stable prop) and randomize in an event handler or
  post-mount `useEffect`. (See `CollectionCard.tsx`'s `seededIndex`.)
- **Config:** branding/locale/analytics come from env via `src/lib/settings.ts`,
  surfaced at `/api/config`. No admin settings UI.

## apps/api (Directus 11)

- Extensions are TypeScript bundles built with `directus-extension-sdk`
  (`directus-extension build`). Schema/config changes go through `directus-sync`
  (push/pull), tracked under `directus-config/`. See `apps/api/CLAUDE.md`.

## apps/web (legacy Nuxt 3 — v2)

Maintenance only; not the standard for new work. If you must touch it: Vue 3
Composition API with `<script setup>`; Nuxt auto-imports (don't import from `vue`/
`#imports`); TanStack Vue Query + Directus SDK with `await suspense()` for SSR;
shadcn-nuxt + Radix Vue in `components/ui/`. Script order: imports → `definePageMeta`
→ constants → refs → data fetching → computed → lifecycle hooks → methods → SEO
(`useHead`/`useSeoMeta`). Its R2R Library and web3/wallet features are deprecated.
