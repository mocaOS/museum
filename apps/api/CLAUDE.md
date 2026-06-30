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
  trusted ratios — `src/v1/media.ts`), `/v1/rooms` (incl. `slot_data_url`
  pointers; the per-room baked slot anchors live at the **public, keyless**
  `GET /v1/rooms/:id/slots` — `rooms.slot_data`, written by
  `apps/migration/bake-slot-data.ts`: positions + facing-resolved quaternions
  so 3D clients hang works without normal-flipping heuristics), `/v1/decc0s[/:id]`
  (aggregated + cached 5 min, `include=profiles,codex` for the heavy blobs /
  lore file — `src/v1/decc0s.ts`), `/v1/search?q=`, **the Library**
  (`POST /v1/library/ask`, `POST /v1/library/ask/stream` (SSE passthrough),
  `POST /v1/library/search`, `GET /v1/library/collections` — proxies MOCA's
  Cortex instance with a server-held read-only key, `src/v1/cortex.ts`), and
  **Souls** (`GET /v1/souls/:chainId/:contractAddress[/:tokenId]` — Soulweaver's
  EIP-191-signed SOUL identity files for web3/agent integrators,
  `src/v1/souls.ts`; ERC-8004/8183/8257 patterns documented in apps/docs
  `pages/web3.mdx`), **ephemeral presence** (`GET /v1/presence/stream`
  SSE + `POST /v1/presence/ping` — public, in-memory broadcast for the docs
  chat widget, NOTHING persisted by design — `src/v1/presence.ts`), and the
  **museum guide** (`src/v1/guide.ts` — public like presence, IP-rate-limited:
  `POST /v1/guide/exhibitions` registers a spawned exhibition and enriches it
  from `rooms`/`nfts` into a context document persisted in the
  `guide_exhibitions` collection (in-memory fallback pre-`directus-sync push`);
  `GET /v1/guide/exhibitions/:id[/suggestions]` serve it; `POST /v1/guide/ask`
  answers in-world visitor questions). **Hybrid conversation model
  (`MUSEUMAGENT_*` set):** every `/v1/guide/ask` reply is a FAST direct chat
  completion via the `museum-agent.ts` client (an OpenAI-compatible model, MOCA
  points it at Venice) over a context window assembled fresh per turn —
  persona + the aggregated MOCA brief (`guide-intro.generated.ts`, built by
  `npm run build:intro` from apps/docs) + authoritative exhibition facts + the
  visitor's rolling **session memory** + an accumulated **insights bucket**
  (`mode: 'fast'`). The fast model is `MUSEUMAGENT_MODEL` (currently
  `qwen3-5-35b-a3b`, 256k context); on Venice bases the client auto-sends
  `venice_parameters: { disable_thinking: true, strip_thinking_response: true }`
  so reasoning ("-it") models return non-empty content fast instead of burning
  the budget on hidden chain-of-thought. Context budgets:
  `MAX_CONTEXT_CHARS=256000`, `EXHIBITION_FACTS_MAX=50000`,
  `MAX_ARTWORKS_PER_ROOM=256`, with `museum-agent.ts` `MSG_MAX_CHARS=300000`
  (kept above `MAX_CONTEXT_CHARS` so the transport never truncates the prompt).
  **Library routing:** a deterministic `needsLibrary()` router catches
  macro/historical/era/market questions, artist deep-dives, **and biographical /
  persona questions about people NOT in the exhibition** ("who is Beeple?",
  "tell me about Pak") — those reply with a quick in-character ACKNOWLEDGEMENT
  ("Great question — let me ask our librarian…") and the real Cortex-backed
  answer is delivered moments later via the follow-up (an earlier
  model-self-tagging `[ASK_LIBRARY]` approach was tried and removed — the model
  wouldn't reliably defer; routing is now server-side). The ack response carries
  **`consulting: true`** so the in-world guide shows a "consulting the museum
  library" status (held until the follow-up lands) instead of going idle.
  Deictic phrasing ("this piece", "this room", "it") stays on the fast path.
  **Spatial awareness:** the in-world guide resolves the visitor's room itself
  from a baked world map and sends **`roomUid`** (+ `visitorPos` as a fallback);
  the API prefers the explicit room, else `whereIs()` — the room the visitor is
  inside, else the NEAREST room (capped at ~3× its footprint radius). It also
  notices when `roomUid` **changed since the last turn** and tells the model the
  visitor MOVED, so the guide stops narrating the room they started in. The
  guide additionally sends **`focus`** (the work the visitor stands in front of,
  resolved from the baked map) → a `[THE WORK RIGHT IN FRONT OF THE VISITOR]`
  context line so "which artwork is this?" answers about the right piece. The
  location block still lists the room's full curated piece list with an exact
  count. **Mint dates:**
  each artwork carries a best-effort mint/creation date parsed from OpenSea
  traits (null when absent — MOCA has no mint-date column and the OpenSea blob
  only has `updated_at`), surfaced in the exhibition facts + location line.
  After replying, two things run ASYNCHRONOUSLY (fire-and-
  forget, never blocking): the turn is summarized into the session memory
  (compacted before limits), and Cortex mines the deeper knowledge the visitor
  referred to — in DEEP mode (`use_graph: true`) now that the reply path is
  fast — into the separate insights bucket, enriching the NEXT reply. Session
  memory + insights are **ephemeral**, keyed by a per-visitor
  `session` id the in-world app sends (privacy posture of `/v1/presence`; nothing
  durable). **Shared insight cache + pre-warm:** mined insights are also cached
  at the EXHIBITION level (keyed by normalized topic), so the *first* answer on a
  topic is already deep and Cortex isn't re-queried per visitor — `/v1/guide/ask`
  folds any cached hits into the context synchronously before replying (no added
  latency), and `POST /v1/guide/exhibitions` fire-and-forget **pre-warms** a few
  of the exhibition's rooms/works into that cache on registration. **Full-answer
  voice (chunked):** the WHOLE answer is spoken — `spokenChunks()` splits it into
  short, sentence-aligned segments (≤320 chars) and `prepareVoiceChunks()`
  returns an **`audioUrls[]`** the in-world guide plays back-to-back (a single
  `audioUrl` = first chunk stays for older guides). This fixes the old
  mid-message cutoff (a single ~360-char "spoken lead" truncated every longer
  answer). The first one or two chunks are **pre-warmed at ask time**
  (fire-and-forget `synthPending`) so the voice lands ~1-2s after the text;
  later chunks synthesize lazily on their own GET. (Venice TTS is
  several seconds per request — `VENICE_TTS_MODEL` choice dominates
  this; pick a fast one.)
  **Follow-up (closes the loop):** EVERY question's Cortex result is delivered
  as a follow-up via the public **`GET /v1/guide/followup?exhibition&session`** —
  the composer receives the prior fast reply and either **extends** it (no
  repetition) for normal questions, or **is** the answer after a library-router
  ack. The in-world guide polls that endpoint for ~50s after a fast reply and,
  on a hit (TTS pre-warmed), speaks it; a follow-up that arrives mid-speech is
  queued so it never talks over the initial voice. **Durable/shared state (optional):** with `REDIS_ENABLED` +
  `REDIS` set, sessions + the shared insight cache write through to Redis
  (`guide-store.ts`, `ioredis`) so they survive a redeploy and span replicas;
  unset → pure in-process maps, identical to before. The `pendingInsight` /
  `summarizing` guards stay process-local (a rare duplicate mine is harmless).
  **Legacy / degraded paths:** with `MUSEUMAGENT_*` unset the guide
  uses the prior Cortex-primary lean chat path (`use_agentic: false`, `use_graph:
  false`, `top_k: 4`, `mode: 'cortex'`); it retries one *fast* transient Cortex
  5xx (`askCortexResilient`), and on any failure (5xx, timeout, or `CORTEX_*`
  unset) degrades to an exhibition-context-only answer marked `fallback: true`
  instead of erroring — so the in-world guide never goes dark. Fully additive:
  deployments without the new env behave exactly as before.
  Failures are logged (`[moca-guide]` warnings: once at boot if `CORTEX_*` is
  missing, throttled on upstream errors), so a guide that only gives generic
  answers is diagnosable from the Directus logs. **Requires `CORTEX_API_URL` +
  `CORTEX_API_KEY` on this Directus deployment** (see Env below) to reach the
  Library at all; without them every answer is a `fallback`.
  **Voice (optional):** when `VENICE_API_KEY` is set, `/v1/guide/ask`
  synthesizes the answer with Venice TTS (default `VENICE_TTS_MODEL=tts-kokoro`,
  ~0.8s synth vs ~11s for the old `tts-qwen3-1-7b`), caches the mp3, and
  returns an `audioUrl` the in-world guide plays; served at the public
  **`GET /v1/guide/tts/:id.mp3`** (short-TTL in-memory cache). The default voice
  is **model-aware** (`af_heart` for kokoro, `Serena` for qwen) — set only when
  `VENICE_TTS_VOICE` is unset, so swapping the model alone never 400s on an
  incompatible voice id. `speak`/`voice` ride in the ask body; no key →
  text-only, no error.
- **Auth** (`src/v1/auth.ts`): keys in the **`moca_api_keys`** collection
  (admin-managed; generate with `echo "moca_$(openssl rand -hex 24)"`), sent
  as `X-API-Key` or `Authorization: Bearer`. In-memory key cache (60 s) +
  sliding-window rate limit (`MOCA_API_RATE_LIMIT`, default 120 req/min/key),
  throttled `last_used` stamping.
- **Envelope**: Directus-style `{ data, meta? }` / `{ errors: [...] }` —
  matches the DeCC0s docs conventions.
- **Env**: optional `MOCA_API_RATE_LIMIT`, `DECC0S_API_URL` (defaults to
  `https://api.decc0s.com`), `CORTEX_API_URL` + `CORTEX_API_KEY` (read-only;
  unset → `/v1/library/*` answers 503 **and** the museum guide answers from
  exhibition context only, `fallback: true`, with a `[moca-guide]` boot
  warning). **Guide↔Cortex latency:** non-streaming `/api/ask` is one retrieval +
  one generation (no agent loop), so the answer-LLM's prefill dominates. The
  guide therefore sends Cortex a SLIM `cortexGroundingBlock` (persona name +
  rooms/artists/works by name, ≤3.5k chars) — NOT the full `contextBlock`
  (persona SOUL + every artwork description, up to ~62k), which is reserved for
  the LOCAL fast model (`buildSystemContext`). Feeding the full block to Cortex
  was the cause of the 52s `[moca-guide] cortex mine(vector)` lines (≈15k input
  tokens of prefill on gemma4) that blew the in-world ~50s follow-up window. The
  proxy (`cortex.ts`) also forwards cortex-app's latest RAGRequest fields
  (`conversation_memory`, `use_fast_search`, `max_hops`) for `/v1/library/*`
  integrators, and the guide uses the lean vector path (no rerank) on its fast
  attempts. The Cortex deployment should still run cortex-app's June-2026
  recommended stack (`OPENAI_MODEL=google-gemma-4-26b-a4b-it`,
  `OPENAI_MAX_CONTEXT=256000`, reasoning off — `.env.recommended`). Also
  `VENICE_API_KEY` (+ optional `VENICE_API_URL`, `VENICE_TTS_MODEL` `VENICE_API_KEY` (+ optional `VENICE_API_URL`, `VENICE_TTS_MODEL`
  default `tts-kokoro`, `VENICE_TTS_VOICE` model-aware default — `af_heart` for
  kokoro, `Serena` for qwen — set only when unset) — the guide's
  voice; unset → guide stays text-only, `MUSEUMAGENT_BASEURL` +
  `MUSEUMAGENT_API_KEY` + `MUSEUMAGENT_MODEL` (OpenAI-compatible chat completions
  — the guide's fast hybrid reply brain; all three required to enable it, else
  the guide stays Cortex-primary; MOCA runs `qwen3-5-35b-a3b` on Venice),
  optional `GUIDE_DEBUG_CORTEX=true` (traces the guide's Cortex calls — kind,
  status, latency, source docs — in the logs), `SOULWEAVER_API_URL` +
  `SOULWEAVER_API_HEADERS` (defaults to the public deployment at
  `https://soulweaver.museumofcryptoart.com`; override for self-hosted); and the
  shared Directus `REDIS_ENABLED` + `REDIS` (when set, the guide persists
  sessions + the shared insight cache to Redis so they survive a redeploy and
  span replicas — `guide-store.ts`; unset → in-process only, unchanged).
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
