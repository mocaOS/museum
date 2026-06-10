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
| `v1` | `GET /v1/*` | **The public MOCA API for integrators** (see below). |

### The MOCA API (`src/v1/`)

The unified public API: museum collections / artworks / 3D rooms plus the Art
DeCC0s knowledge base aggregated from `https://api.decc0s.com` — one surface,
one key. Documented at **`apps/docs`** (Zudoku site → docs.museumofcryptoart.com);
the OpenAPI spec there (`apps/docs/apis/moca-v1.json`) is the response-shape
source of truth.

- **Routes**: `GET /v1` (public index), then key-gated: `/v1/collections[/:slug]`,
  `/v1/artworks[/:id]` (media normalized like the museum frontend — dead-host
  revival, original-file preference over square-cropped i2c.seadn.io variants,
  trusted ratios — `src/v1/media.ts`), `/v1/rooms`, `/v1/decc0s[/:id]`
  (aggregated + cached 5 min, `include=profiles,codex` for the heavy blobs /
  lore file — `src/v1/decc0s.ts`), `/v1/search?q=`, **the Library**
  (`POST /v1/library/ask`, `POST /v1/library/ask/stream` (SSE passthrough),
  `POST /v1/library/search`, `GET /v1/library/collections` — proxies MOCA's
  Cortex instance with a server-held read-only key, `src/v1/cortex.ts`), and
  **Souls** (`GET /v1/souls/:chainId/:contractAddress[/:tokenId]` — Soulweaver's
  EIP-191-signed SOUL identity files for web3/agent integrators,
  `src/v1/souls.ts`; ERC-8004/8183/8257 patterns documented in apps/docs
  `pages/web3.mdx`), and **ephemeral presence** (`GET /v1/presence/stream`
  SSE + `POST /v1/presence/ping` — public, in-memory broadcast for the docs
  chat widget, NOTHING persisted by design — `src/v1/presence.ts`).
- **Auth** (`src/v1/auth.ts`): keys in the **`moca_api_keys`** collection
  (admin-managed; generate with `echo "moca_$(openssl rand -hex 24)"`), sent
  as `X-API-Key` or `Authorization: Bearer`. In-memory key cache (60 s) +
  sliding-window rate limit (`MOCA_API_RATE_LIMIT`, default 120 req/min/key),
  throttled `last_used` stamping.
- **Envelope**: Directus-style `{ data, meta? }` / `{ errors: [...] }` —
  matches the DeCC0s docs conventions.
- **Env**: optional `MOCA_API_RATE_LIMIT`, `DECC0S_API_URL` (defaults to
  `https://api.decc0s.com`), `CORTEX_API_URL` + `CORTEX_API_KEY` (read-only;
  unset → `/v1/library/*` answers 503), `SOULWEAVER_API_URL` +
  `SOULWEAVER_API_HEADERS` (defaults to the public deployment at
  `https://soulweaver.museumofcryptoart.com`; override for self-hosted);
  reuses `PUBLIC_URL` for asset links and `CODEX_DIR` for codex documents.
- **Deploying a schema change**: the `moca_api_keys` collection ships as
  directus-sync snapshot files — run `npx directus-sync push` after deploying,
  then create the first key item in the Directus admin UI.

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
