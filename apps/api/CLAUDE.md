# CLAUDE.md — apps/api (Directus backend)

Directus 11 headless CMS for MOCA: it owns collections, NFTs, contracts, rooms,
applications, and settings, and exposes custom hooks + endpoints via extensions.
This is the data source for `apps/museum` (galleries) and the legacy `apps/web`.

- **Directus** `^11.12.0`, **PostgreSQL** (via `pg`), **Redis** (cache + sync store).
- Public URL in prod: `https://api.moca.qwellco.de` (`http://localhost:8055` in dev).

## Commands

```bash
cd apps/api
cp .env.example .env          # fill DB/Redis/admin/keys
npx directus start            # run the API on :8055 (EXTENSIONS_AUTO_RELOAD=true in dev)
npx directus-sync pull        # snapshot remote schema/config → directus-config/
npx directus-sync push        # apply local snapshot to the target instance
./create-migration.sh <name>  # scaffold a raw DB migration under migrations/

# Build an extension (run inside the extension dir)
cd extensions/directus-extension-moca
npm run build                 # directus-extension build → dist/{api,app}.js
npm run dev                   # watch + no-minify
```

## Environment (`.env.example`)

- **DB:** `DB_CLIENT=pg`, `DB_HOST/PORT/DATABASE/USER/PASSWORD`, `DB_SSL`
- **Auth/security:** `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOKEN`, `SECRET`,
  `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_TTL`
- **Redis:** `REDIS_ENABLED`, `REDIS`, `SYNCHRONIZATION_STORE` (multi-instance schema ops)
- **Server:** `HOST`, `PORT` (8055), `PUBLIC_URL`, `CORS_*`, `LOG_LEVEL`,
  `EXTENSIONS_PATH` (`./extensions`), `EXTENSIONS_AUTO_RELOAD`
- **Storage:** `STORAGE_LOCATIONS` (local), `STORAGE_LOCAL_ROOT` (`./uploads`)
- **External services:** `OPENSEA_API_KEY`, `COOLIFY_TOKEN` / `COOLIFY_BASE_URL` /
  `COOLIFY_API`, and `R2R_ENDPOINT` / `R2R_API_KEY` (**legacy — see below**)
- `directus-sync.config.js` reads `PUBLIC_URL` + `DIRECTUS_API_KEY` (env-aware).

## Extensions

Both are Directus **bundle** extensions (host `^10.10.0`), built with
`directus-extension-sdk` → `dist/api.js` (server) + `dist/app.js` (admin UI). Directus
auto-discovers them from `EXTENSIONS_PATH` via the `directus:extension` field in each
`package.json`.

### `extensions/directus-extension-moca` — the main extension

**Hooks** (`src/<name>/index.ts`):

| Hook | Trigger | Does |
|------|---------|------|
| `insert-opensea-data` | `items.create` filter on `contracts` & `nfts` | Enriches new contract/NFT rows from the OpenSea API v2 (name, collection, standard, raw response). |
| `opensea-listings-sync` | schedule (every minute) | Pulls top listings for `art-decc0s/best`, writes `settings.adoption` (token-id CSV) + `settings.adoption_details` (JSON w/ price); also hourly Coolify restart. |
| `coolify-logs-sync` | schedule (every minute) | Tails logs for linked Coolify `applications`; if a deploy is stalled 12h+, stops it and sets `applications.status = offline`. |
| `r2r-document-sync` | `files.delete` + schedule | **Legacy/deprecated.** Ingests `.md`/`.pdf` from the Directus "R2R" folder into R2R; tracks `r2r_id`/`r2r_ingestion_status`/`r2r_extraction_status` on `directus_files`; deletes R2R docs on file delete. |
| `r2r-graph-pull` | schedule (every minute) | **Legacy/deprecated.** Pulls extracted entities into the R2R knowledge graph. |

**Endpoints** (`src/<name>/index.ts`):

| Endpoint | Route | Does |
|----------|-------|------|
| `applications` | `POST /applications/start`, `POST /applications/stop`, `GET /applications/url` | Auth'd (ethereum-address ownership). Creates/restarts/stops a Coolify app for agent deployment (nixpacks, port 3005, random `agents-*` subdomain), polls deploy status, returns URL + live logs. |
| `codex` | `GET /codex/:token_id` | Returns the Art DeCC0 character codex JSON from `CODEX_DIR/Art_DeCC0_<padded>.codex.json` (default `./codex`). |
| `listings` | `GET /listings` | Returns `settings.adoption_details` (parsed JSON: tokenId + price). |

### `extensions/directus-extension-raw-query` (third-party, creazy231)

Admin-only raw SQL tool. `GET /raw-query/schema` (tables/columns for autocomplete),
`POST /raw-query/execute` (runs `;`-separated queries). Bundles an admin UI module too.

## Schema & config (`directus-config/` via directus-sync)

Version-controlled snapshot of the instance:

- `snapshot/collections/` — `applications`, `contracts`, `nfts`, `collections`,
  `rooms`, `settings`.
- `snapshot/fields/` — field defs (incl. NFT `r2r_id` / `r2r_ingestion_status` /
  `r2r_extraction_status` / `retry` — legacy R2R tracking).
- `snapshot/relations/` — FK/M2M relations.
- `specs/openapi.json`, `*.graphql` — regenerated API specs.
- Top-level `flows.json`, `roles.json`, `policies.json`, `permissions.json`,
  `dashboards.json`, `settings.json`, `translations.json`, etc.

**Workflow:** edit in the Directus UI → `directus-sync pull` to capture → commit →
`directus-sync push` on deploy. Use `migrations/` (e.g. the custom `nfts.identifier`
index) only for raw DB changes outside Directus' schema model.

## R2R status (legacy)

The `r2r-document-sync` / `r2r-graph-pull` hooks and the `directus_files.r2r_*` fields
feed the **deprecated v2 R2R Library** (the `apps/web` RAG). The current Library is
**Cortex** (`apps/museum` → `library.moca.qwellco.de`), which is a separate external
service — it is **not** populated by these Directus hooks. Treat the R2R hooks as
maintenance-only; don't extend them for new Library work.

## Integrations summary

- **OpenSea** — NFT/contract metadata enrichment + listings (hooks).
- **Coolify** — agent app orchestration (the `applications` endpoint + logs hook).
- **R2R** — legacy document/graph sync (deprecated, see above).
