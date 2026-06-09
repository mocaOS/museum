# Deployment

Two deployment paths: the Turborepo workspaces (Directus, Nuxt, agents) and the
standalone `apps/museum` Next.js site.

## Platform

- **Coolify** with a **Traefik** proxy (TLS termination). Hosted under `*.qwellco.de`
  and `museumofcryptoart.com`.
- **CI/CD:** GitLab CI (`.gitlab-ci.yml`).
- **Turbo remote cache:** `remote-cache.deploy.qwellco.de`.

## Workspace apps (Directus / Nuxt / agents)

- **Build:** Nixpacks (`nixpacks.toml`) — Node 22, `bun install --frozen-lockfile`,
  `bun run build`, `bun run start`.
- **Custom deploy script:** `yarn deploy` (`deploy.js`).
- **Patched deps:** `@directus/api@31.0.0` has a local patch in `patches/`.

## apps/museum (Next.js — museumofcryptoart.com)

Deployed **separately** from the workspace (it's not a workspace member):

- Build via its own **`apps/museum/Dockerfile`** — Next.js `output: "standalone"`,
  served by `node server.js` (the standalone bundle includes traced `node_modules`).
- **Port 3331.** Point the `museumofcryptoart.com` domain at the container in Coolify;
  Traefik terminates TLS.
- **No volumes / no database** — chat history is client-side `localStorage`, branding
  is env, the Library uses a remote Cortex key. (The old SQLite/`/app/data` volume was
  removed.)
- **Env:** only `CORTEX_API_URL` + `CORTEX_API_KEY` are needed for the Library, plus
  `DIRECTUS_URL` and `NEXT_PUBLIC_SITE_URL` (build-time inlined for SEO). Optional
  branding/analytics vars — see `apps/museum/.env.example`.
- `docker-compose.yml` in `apps/museum` is the canonical env reference.

## Directus schema/config

Schema and config are version-controlled via **`directus-sync`** under
`apps/api/directus-config/`. After changing collections/fields/flows/permissions in
the Directus UI, run `npx directus-sync pull` to snapshot; deploys apply with
`npx directus-sync push`. See `apps/api/CLAUDE.md`.

## Pre-deploy checklist

1. Build locally first (`bun run build` for workspaces; `cd apps/museum && npm run build`).
2. Verify on staging where applicable.
3. For Directus schema changes, `directus-sync push` against the target instance.
4. Watch logs after deploy.
