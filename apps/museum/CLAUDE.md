# CLAUDE.md

## Project Overview

MOCA Library — a Next.js 16 app serving the Museum of Crypto Art galleries plus a
**public, anonymous** chat front-end for the Cortex RAG knowledge assistant
(upstream codename: `library-backend`).

This app was forked from `cortex-chat`, a multi-tenant suite. The multi-user layer
(accounts, superadmin, user groups, minted per-group/per-user keys, encrypted key
storage, admin console, server-side history) has been **stripped out** — the Library
chat is a single-key, anonymous experience. If you see references to
auth/users/groups/admin anywhere, they are stale; there is no app-local database.

**Exception — community document submissions (see "Community submissions & review"
below).** There is now ONE narrowly-scoped authenticated surface: web3 users can
submit documents for review, and whitelisted admins approve them into Cortex. It uses
a **SIWE session** (not the old account system) and stores the review queue in the
monorepo's **Directus** (not an app-local DB). The anonymous read-only chat is
unchanged.

**Key features:**
- Anonymous public Library — no login, no accounts
- Streaming SSE responses from backend (`/api/ask/stream`)
- Chat and Deep Research modes
- Collection-scoped search (default: all collections the read-only key can see)
- Source citations with modal viewer
- Graph context (entities/relationships), thinking steps
- i18n (EN/DE), locale set via env
- **Client-side chat history** in `localStorage` — persists per machine across days
- Auto-generated chat titles via LLM after the first response
- Branding (accent color, logo, title, locale) configured via env, exposed at `/api/config`
- Optional static `cortexAnalyticsTemplate` context block injected server-side into
  every backend request for consumption by agent skills

## How we talk to Cortex

One backend, one key. `src/lib/cortex.ts` exposes `getCortexUrl()` (`CORTEX_API_URL`)
and `getCortexKey()` (`CORTEX_API_KEY`, a single **read-only** key). The browser never
calls Cortex directly — all traffic goes through `/api/ask/stream` and
`/api/proxy/[...path]`, which inject `X-API-Key: <CORTEX_API_KEY>`. If the key is
unset, those routes return 503 ("Library not configured") and the galleries still work.

There is no key minting, no encryption-at-rest, no per-user/per-group scoping. The
Cortex backend filters reads by whatever the key can access.

## Community submissions & review (web3)

Web3-authenticated visitors can **submit documents** into the museum's Cortex
knowledge base, gated by an admin **review** step. Modeled on soulweaver's
lore-review flow, adapted to this app's DB-less-app + Directus-data-layer split.

**Auth — SIWE (Sign-In With Ethereum).** The wallet connection (Reown/wagmi) is
client-side and unauthenticated, so it can't be trusted for writes. `signIn()`
(`hooks/useAuthSession.ts`) runs a nonce → sign → verify handshake; the server
verifies the signature (`lib/web3/siwe.ts`, viem — ERC-1271/6492 aware with an EOA
recover fallback) and mints a short-lived **HMAC-signed httpOnly session cookie**
(`lib/web3/session.ts`, `SESSION_SECRET`). Routes: `POST /api/auth/nonce`,
`POST /api/auth/verify`, `GET /api/auth/session`, `POST /api/auth/logout`. Every
privileged route re-derives the acting address from the **session**, never from
client input. Admin whitelist is `LIBRARY_ADMIN_ADDRESSES` (comma-sep env,
`lib/web3/admins.ts`).

**Queue — Directus (`library_submissions`).** The museum app writes the queue via a
single scoped static token (`DIRECTUS_SUBMISSIONS_TOKEN`); the API routes are the
policy layer (submitter vs. admin), not Directus RBAC (`lib/library/submissions.ts`).
`POST /api/library/submissions` (session-gated, multipart) uploads the file to
Directus and creates a `pending` row with the verified `submitted_by` — it does **not**
touch Cortex. `GET` (admin) lists for the review table; `[id]/file` streams a file for
preview (admin, keeps the token server-side).

**Approve → Cortex.** `POST /api/library/submissions/approve` (admin) pushes each
file into the Cortex **Collective** collection via the **management key**
(`CORTEX_MANAGEMENT_API_KEY`, a `cortex_rw_` key — distinct from the read-only chat
key) using `POST /api/upload` (serialized ~1.1 s apart for Cortex's ~1 rps;
`lib/library/cortex-management.ts` resolves-or-creates the collection like
`apps/hyperfy/harvest-hyperfy-docs.mjs`), then flips the row to `approved` with the
returned `cortex_document_id`. A per-item failure leaves the row `pending` for retry.
`POST .../reject` marks `rejected` (kept for audit). Rejected/pending content is never
ingested.

**UI.** Header shows a **Submit** button (any connected wallet) and a **Review** link
(admins) via `components/library/LibraryContribute.tsx`; the submit modal is
`SubmitDocumentDialog.tsx`. The moderation table is `/library/review`
(`components/library/ReviewTable.tsx`): status tabs, a **Submitted-by** column that
**ENS-resolves** addresses (`hooks/useEnsNames.ts` + `components/wallet/AddressLabel.tsx`,
reused by the account label) and is filterable by address or ENS, multi-select
Approve/Reject on the pending view. Allowed types mirror Cortex: `.pdf .txt .md .docx
.xlsx`, ≤50 MB.

**Directus setup (operator, one-time).** Create a `library_submissions` collection with
fields: `title` (string), `file` (M2O → `directus_files`), `filename`, `file_type`
(string), `file_size` (integer), `submitted_by` (string), `status` (string:
pending/approved/rejected, default pending), `rejected_reason` (string, nullable),
`cortex_document_id` (string, nullable), `cortex_synced` (boolean, default false),
`reviewed_by` (string, nullable), `reviewed_at` (timestamp, nullable). Then create a
dedicated role/policy with CRUD on `library_submissions` + file create/read, generate a
static token → `DIRECTUS_SUBMISSIONS_TOKEN`. Capture the collection via
`npx directus-sync pull` and commit. Do **not** give this collection a public read
policy. See `apps/api/CLAUDE.md`.

## Chat history (client-side)

History lives entirely in the browser. `src/lib/chatHistory.ts` stores an array of
`ChatSession` under `localStorage["moca-library-chats"]` — same `listChats/getChat/
createChat/updateChatMessages/updateChatTitle/deleteChat` signatures as before, just
no network. `src/app/library/page.tsx` creates a session lazily on the first message,
persists on each settled turn, and the opaque `conversation_memory` blob rides along in
the session. Because it's `localStorage` (not `sessionStorage`), a visitor's chats
survive reloads and restarts until they clear browser storage.

## Cortex analytics

Optional static context block prepended to every backend request, server-side, for
backend agent skills to read.

- **Source:** `CORTEX_ANALYTICS_TEMPLATE` env var (`getAppSettings().cortexAnalyticsTemplate`).
  Empty default → no injection.
- **Injection:** `injectCortexAnalytics(bodyText, template)` in `src/lib/cortex-analytics.ts`
  prepends `{role:"user", content: template}` to `conversation_history` before the
  `/api/ask/stream` proxy forwards upstream. Fails open on malformed JSON.
- **Invisibility:** the block never reaches the browser (proxy mutates the body
  server-side only) and is never written to localStorage. Re-applied per request.
- Note: there are no users, so there is no per-user variable substitution — the
  template is injected verbatim.

## Collection Scoping (user-facing)

- Chat and Deep Research default to searching **all collections the key can read**.
  No `collection_id` is sent — the backend filters by key scope.
- Users can narrow to a single collection via the settings panel (gear icon).
- The scope indicator in `ChatInput` shows the resolved collection name or
  "Searching across all collections".

## Exhibitions & the 3D world builder

`/rooms` lists the museum's 3D rooms (Directus `rooms` collection, GLB models)
with a per-room viewer; `/rooms/world` is the **world builder** — an RTS-style
mode where visitors place rooms onto a shared ground plane, hang artworks from the
collection on wall slots, adjust each piece, and save named exhibits. All client-side,
no accounts. Code lives in `src/components/museum/three/`:

- **`WorldBuilder.tsx`** — the builder scene: goal-damped RTS camera (WASD/edge pan,
  Q/E rotate, wheel **zoom-to-cursor**, RMB orbit, MMB pan, double-click room to
  focus), room placement/dragging/rotation (right-click cancels placing, R/Shift+R
  rotate, C curates the selection), curate mode, keyboard map, cursor feedback.
  The **camera director** (`CameraApi`) exposes scenario verbs — `frameRoom`,
  `frameExhibition` (Home / reset button), `birdsEye(uid)`, FOV-fitted
  `focusSlot` — that resolve framing from live datapoints (per-room measured
  world bounds via `onBounds`, exhibition extents, the camera's actual FOV)
  instead of fixed distances; long fly-tos arc up over the world via a decaying
  `lift` that any manual input cancels. **Perf invariants (don't regress):**
  room GLBs get three-mesh-bvh bounds trees (refcounted per shared geometry —
  pointer events + clearance probes would otherwise walk every triangle per
  mousemove), the event raycaster runs `firstHitOnly`, `PlacedRoom` is
  memoized behind uid-routed referentially-stable callbacks (`actionsRef`),
  the placement ghost and room dragging update imperatively / grid-gated
  (never a React render per mousemove), and far-away `VideoTexture` works
  auto-pause (`ArtworkPlane` distance cull with hysteresis).
- **`BuilderSidebar.tsx`** — the unified exhibition-management panel on the left
  (collapsible to an icon rail): **Build** (searchable room library + selected-room
  actions + clear), **Curate** (per-room fill progress, slot chips, active-slot
  scale/reset/remove, embedded artwork browser, auto-fill), **Exhibits** (saved
  exhibits + **Spawn to Hyperfy** primary CTA + file export). Slot clicks in 3D
  auto-reveal the Curate tab. While curating, a **source toggle** (`MOCA
  collections` | `Multipass`) swaps the embedded browser between the museum
  collections (`ArtworkBrowser`) and the **Multipass importer**
  (`MultipassImporter`); both hang through the same `onPickArt` path.
  **Auto-fill is filter-driven**: it fills every empty slot from the collections
  browser's *current* filter (collection scope + search), reported up via
  `ArtworkBrowser`'s `onQuery` → `browserQueryRef` in `WorldBuilder`. The Curate
  tab surfaces the active basket ("Auto-fill from <scope> · "<search>"") and the
  button reads "Auto-fill filtered" when a filter is active — so a curator can
  narrow the basket (e.g. one collection, or a search term across all
  collections) then fill at scale. Unfiltered, it randomizes a spread across all
  collections. The Build selected-room panel and the Curate header each link
  **"View room ↗"** to that room's `/rooms/[id]` detail page (new tab).
  **Deep-link in:** `/rooms/world?room=<id>` (the rooms catalogue's per-card
  "Start exhibit" shortcut + the detail page's "Build with this room" CTA) makes
  `WorldBuilder` place that room and land in curate on it. It reads the id from
  the URL post-hydration and strips it immediately (refresh/StrictMode-safe), and
  is **append-only** — never disturbs an existing saved layout.
- **`ControlsHelp.tsx`** — bottom-right nav cluster (zoom in/out, reset view, help
  icon) plus the grouped controls reference that slides in on the right (H toggles).
- **`ArtworkPlane.tsx`** — one hung work: textured plane + matte frame, sized to the
  work's true aspect ratio (read from the loaded texture's pixels, falling back to
  catalog `ratio`). In curate mode supports drag-to-move along the wall plane and a
  corner-handle resize; both write a per-slot override `{dx, dy, scale}`.
- **`ArtworkPicker.tsx`** — exports `ArtworkBrowser`, the embeddable search/browse
  grid used by the sidebar's Curate tab (`/api/museum/artworks`,
  `/api/museum/collections`), scoped by collection, click to hang. Also exports
  the shared `ArtworkGrid` (the 2-col clickable card grid) and `thumbUrl`, reused
  by `MultipassImporter` so both sources render identical cards.
- **`MultipassImporter.tsx`** — the **Multipass importer** in the Curate panel:
  drop a wallet address to pull that wallet's curations from the **legacy MOCA
  app** (`app.museumofcryptoart.com/member/<address>`) and hang them on room
  walls. The wallet's **repertoires** (curated collections, e.g. `cryptoart` →
  "Community Collection") and **exhibitions** become a grouped tab dropdown;
  picking a tab paginates its works (24/page, order preserved) and clicking one
  hangs it via the same `onPickArt` contract as `ArtworkBrowser`, so drag/resize,
  auto-fill, and Hyperfy export all work unchanged. Data comes from
  `/api/museum/multipass` (address → `{member, tabs}`) and
  `/api/museum/multipass/items` (legacy item ids → `NftView[]`); the mapping
  lives in **`src/lib/museum/multipass.ts`**, which reads the public legacy
  **Strapi v3** backend at `api.museumofcryptoart.com` (`/users/{address}` for
  the curations, `/items?id_in=…` to resolve works) and maps each legacy item to
  the builder's `NftView` (artist from `metadata.createdBy`, original-file aspect
  ratio, video clip + still poster — video clips often sit on the dead
  `openseauserdata.com` host that the transform-in proxy revives). Legacy item
  ids are offset by `MULTIPASS_ID_OFFSET` (1e9) so a Multipass work and a museum
  work never collide in the builder's `id`-keyed auto-fill dedup; unknown wallets
  (legacy `204`/`404`) surface as "no profile". The API routes are zod-validated
  and hardcode the legacy host (no SSRF surface). NB: the toggle only appears once
  you're actively curating a placed room — you need a wall slot to hang into.
- **`ExhibitsPanel.tsx`** — save/load/update/delete named exhibits (embedded in the
  sidebar's Exhibits tab).
- **`SpawnHyperfyDialog.tsx`** — spawns the current exhibition into any
  self-hosted Hyperfy v2 world straight from the browser (world URL + admin
  key, persisted in `moca-hyperfy-target-v1`; per-room progress + post-spawn
  verification). The protocol/orchestration lives in
  `src/lib/museum/hyperfy/` — `protocol.ts` (minimal msgpackr wire client,
  pinned to Hyperfy v0.16.0), `room-script.ts` (generated per-room app script:
  `app.configure` refinement props + the embedded in-world slot editor + **per-mesh
  trimesh colliders** — the script **collects the loaded model's meshes via
  `app.traverse` FIRST, then creates a static `rigidbody`+`collider{type:'geometry'}`
  per mesh in a second pass** (parented to the mesh) so floors/walls/stairs are
  solid (the blueprint model defaults to `collision:'auto'`, no collider-tagged
  meshes). Creating colliders *inside* the traverse callback was a bug: `traverse`
  reads children after the callback and a collider's `.geometry` is always truthy,
  so it recursed into the just-added collider and ran to the cap on the first mesh
  — leaving multi-mesh rooms walk-through while single-mesh un_MUSEUMs stayed
  solid. NB: `app.create('model')` is NOT a runtime node — blueprint-only — so the
  traversal is the supported path. **Artwork LOD:** a still work hangs at the
  uploaded **768w** default and the room script swaps `image.src` to the remote
  **2048w** `/api/museum/texture` HQ within ~7m (revert ~12m, hysteresis); the
  engine loader fetches + caches the HQ per client (HQ is not uploaded).
  **Proximity video playback:** motion works never autoplay — they hang as
  their still poster (or a src-less video plaque when no poster exists) and the
  video node is created/loaded + played only while a visitor is within **10m**
  (paused past 13m, hysteresis; the poster hides once frames actually play so
  the motion shows from both sides of the wall). Mounting a video WITH src
  downloads + decodes immediately in the engine, so eager creation made
  video-heavy rooms pay for every clip at spawn),
  `spawn.ts` (idempotent spawn: deterministic ids from the layout's
  `exhibitionId`, blueprint version bumps on re-spawn, in-world arrangement
  preserved; uploads curated images into the world as content-addressed
  assets). **Layout translation:** the builder normalizes rooms onto 8-unit
  tiles, so exports carry per-room GLB measurements + the baked slot map
  (`footprint`/`groundOffset`/`slots`, lifted from `PlacedRoom` via
  `onMeasure`) and the spawners reproduce the layout by scaling each room to
  `tileMeters` (dialog "Room size", default 16 m) — artworks hang on baked
  anchors (required for un_MUSEUM `Auto_NNN` slots, which never exist as GLB
  nodes) and letterbox into their slot frames like the builder; generated
  scripts divide meter sizes by `rootScale`; legacy scale-1 entities are
  healed on re-spawn. **Native room scale:** each placement carries a per-room
  `scale` (the export's `scale` field — `rootScale = tileMeters/footprint ×
  scale`); new rooms placed in the builder default to **2×** (`DEFAULT_ROOM_SCALE`
  in `WorldBuilder.tsx`, range 0.4–6), and admins resize a room further in-world
  by grabbing it and **Shift+scrolling** — the idempotent re-spawn preserves that
  (`relayout` pushes the layout + native scale back). **In-world slot editor:** with the room's "Slot
  editing" prop on, **scene admins** (not every build-rights player) enter build
  mode (Tab) and hold E at a work to nudge/resize it; the server enforces
  `player.admin` on every adjustment, persists to world `storage.json` keyed by
  the deterministic entity id (survives restarts, rebuilds, re-spawns) and
  rebroadcasts (`moca:adjust` / `moca:adjust:init` app events). The editor is
  wired **lazily, re-checking admin each time build mode is entered** (the local
  player + rank arrive async, so the old once-at-load `me.admin` gate silently
  skipped the editor forever if you weren't admin yet at load).
  **Museum guide:** the dialog's guide toggle (default on) spawns an agentic
  VRM avatar with the exhibition — `spawn.ts` registers the exhibition
  context with the MOCA API (`POST /v1/guide/exhibitions`, the explicit
  opt-in moment where curation data reaches MOCA servers), uploads the
  chosen `.vrm` (catalog `public/avatars/avatars.json`, default
  `decc0.vrm` — Oblak, the #2875 body), and spawns the generated
  `guide-script.ts` app. The
  guide **spawns beside the entry-nearest room and follows a visitor once they
  interact** (with **gravity** — it falls to the floor with you, never hovers).
  The blueprint keeps the `.vrm` as its `model`; the script grabs the engine's
  avatar node via **`app.get('avatar')`** and drives built-in emotes
  (`asset://mp-idle|mp-walk|emote-talk|emote-float|emote-fall.glb`) — it
  **walks/flies/falls** mirroring the followed visitor and **gestures** while
  answering. (NB: a null blueprint `model` crashes the engine's `App.build` →
  red cube + a bricked world tick loop, so the model is always the vrm.) The
  conversation is **pure free-form chat** (type your question, or hold E to
  walk with the guide — no preset/numbered question picking), private per
  visitor. It renders in a **billboarded
  world-space panel** above the guide — a live status line (here / thinking /
  consulting / speaking), the guide name, the visitor's last question, and the
  answer, which is **revealed in lockstep with the spoken voice** (a teleprompter
  that scrolls within a trailing window for long answers). The panel is the whole
  surface — the native world-chat mirror was **removed** (it cluttered and isn't
  built for long-form answers).
  Per-player private answers are fetched server-side from `POST /v1/guide/ask`.
  That endpoint runs a **hybrid** model (when the API has `MUSEUMAGENT_*`): a
  FAST direct LLM reply over exhibition metadata + an aggregated MOCA brief + the
  visitor's session memory (the in-world app sends a per-player `session` id),
  while Cortex mines deeper insights **asynchronously** that enrich a follow-up.
  A deterministic **library router** (`needsLibrary()`) catches
  macro/historical/era/market questions and artist deep-dives: those get a quick
  in-character **acknowledgement** ("Great question — let me ask our
  librarian…") and the real Cortex-backed answer arrives moments later as a
  follow-up. EVERY question's Cortex result is delivered via the public
  **`GET /v1/guide/followup?exhibition&session`** — it *extends* the fast answer
  (no repetition) for normal questions, or *is* the answer after an ack. The
  guide's server-half polls that endpoint every ~2s for ~50s after a fast reply;
  a follow-up that arrives mid-speech is **queued** and plays only once the
  current voice finishes (it never talks over the initial TTS). While a
  library-routed answer is still being mined, that same poll also hands back
  short, **LLM-minted "still researching" bridge** one-liners (unique per turn,
  pre-warmed TTS, flagged `bridge:true`) once the wait crosses **~4s** — the
  guide speaks them to hold attention and keeps the *consulting* state (a bridge
  fills silence only; it's never queued behind the real answer). Falls back to the
  Cortex-primary path + optional Art DeCC0 persona (**default 2875 = Oblak**)
  when `MUSEUMAGENT_*` is unset. When the Directus has a `VENICE_API_KEY`, the
  guide also **speaks** each answer (Venice TTS, default `tts-kokoro` (~0.8s
  synth); the API returns `audioChunks` — per-sentence `{url,text,secs}` — that
  the in-world guide plays back-to-back through an `audio` node, revealing each
  chunk's text as its clip starts and advancing on the clip's **real** end
  (`audio.isPlaying`), so the voice never cuts off early or overlaps the next
  chunk; `speak`/`voice` are app inspector props). That endpoint lives in `apps/api` (`src/v1/guide.ts`)
  and is Cortex-resilient: it retries a fast transient 5xx and degrades to a
  context-only `fallback: true` answer rather than erroring, so the in-world
  guide stays alive even when Cortex is slow/down — but it **requires
  `CORTEX_API_URL`/`CORTEX_API_KEY` on the Directus deployment** to hook the
  knowledge graph in (without them every answer is a context-only fallback).
  NB: Hyperfy's app `fetch` can't stream, so the answer is fetched whole — it's
  revealed in the panel in lockstep with the voice spoken via the audio node (no
  in-world SSE).
  The dialog's **Download guide app (.hyp)** button
  (`guide-hyp.ts` + `hyp.ts`) bundles the same guide as a drag-droppable
  Hyperfy app file — registers the context, then builds
  VRM+script into the engine's `.hyp` format; no world URL/key needed.
  **`GuideDialog.tsx`** (sidebar Exhibits tab → "Museum guide") is the
  dedicated agent launcher: persona picker (searchable Art DeCC0s live from
  api.decc0s.com, Soulweaver soul by chainId/contract/tokenId resolved
  server-side, or an uploaded SOUL.md baked into the app), avatar select,
  then `spawnGuide()` (guide-only idempotent spawn into the same world the
  rooms went to, with verification) or `.hyp` download.
  `protocol.ts`/`room-script.ts`/`guide-script.ts`/`hyp.ts` are **twins of
  `apps/hyperfy/lib/*.mjs`** (the CLI spawner) — keep them in sync.
- **`slots.ts`** — slot extraction from room GLBs. Authoring convention: room
  models carry `Slot_001…Slot_NNN` placeholder quads (material "Slot Placeholder");
  the node transform gives the hang position, but **orientation comes from the
  quad's GEOMETRY** — the area-weighted triangle normal, re-levelled upright via
  `surfaceOrientation` (frame size = in-plane vertex extents in that basis).
  Never trust the node's local +Z as the wall normal: models across the catalog
  author the quad with the normal along any local axis (every slot in "Museum of
  Unlimited Growth ii" has it on +X/+Y after the DCC's −90°-X export rotation),
  and the old +Z assumption fed the facing probe sideways rays → garbage
  orientations ("deranged angles"). Which SIDE the measured normal faces is
  still the clearance probe's job (slot-facing.ts).
  Also defines the `RoomSlotData`/`BakedSlot` types for **`rooms.slot_data`**,
  the baked per-room slot JSON (anchors + resolved facing) written by
  `apps/migration/bake-slot-data.ts` and served publicly (Directus read policy
  + keyless `GET /v1/rooms/:id/slots` on the MOCA API). When a room ships
  fresh `slot_data` (file-id-matched against the GLB being loaded — see
  `freshSlotData()` in `/rooms/world/page.tsx`), the builder uses it wholesale
  and skips extraction, generation, and the runtime facing probe.
- **`slot-facing.ts`** — slot facing resolution: a clearance probe (fan of
  BVH raycasts on both sides of each slot plane, `THREE.DoubleSide` so
  single-sided walls register from behind) decides which side of the wall a
  slot actually faces — the side with enough free depth to stand and view the
  work. Replaces the old bounding-box-center "inward flip" heuristic, which
  misfaced slots on pillars, corridor walls, non-convex rooms, and un_MUSEUM
  embedded slots; the interior tie-break only remains for ambiguous slots
  (both sides open/closed), so those never regress. Final quaternions are
  re-levelled upright (+Z facing, +Y up). Runtime fallback only — baked
  `slot_data` wins; `apps/migration/bake-slot-data.ts` is the 1:1 offline
  port (keep in sync). Auto-generated slots keep their sampled surface normal.
- **`auto-slots.ts`** — runtime fallback slot generation for models with **no**
  `Slot_NNN` placeholders (un_MUSEUMs not yet processed by the embed script —
  single-mesh sculptures whose slot *amount* lives onchain, synced into Directus
  `rooms.slots`, the source of truth). Deterministic seeded surface sampling
  (seed = room id): area-weighted candidates, floor/underside rejection,
  local-flatness scoring, greedy farthest-point pick with relaxing separation.
  Slots face outward along the surface normal (`RoomSlot.auto` skips the
  inward-to-room-center flip) so works hang on walls and lie on slanted limbs.
  **The canonical path is `apps/migration/embed-room-slots.ts`**, which bakes
  the same generated slots (1:1 algorithm port — keep them in sync) into an
  optimized GLB stored as `rooms.model_optimized` (draco + webp): the builder
  loads `model_optimized ?? model` (see `/rooms/world/page.tsx`), while the HQ
  `model` stays untouched for the `/rooms/[id]` viewer. Embedded slots also make
  Hyperfy exports work for un_MUSEUMs (the spawner resolves `Slot_NNN` nodes in
  the GLB it uploads). After (re-)embedding, run
  `apps/migration/bake-slot-data.ts` to refresh `rooms.slot_data` — stale
  bakes are dropped by the file-id check and the builder falls back to the
  runtime path above.
- **`world-storage.ts`** — localStorage persistence. Working layout under
  `moca-world-layout-v1` (payload is **v2**: placements + assignments + slot
  overrides + `exhibitionId`, the stable identity Hyperfy spawns key their
  deterministic ids on; v1 payloads migrate on load). Named exhibits under
  `moca-world-exhibits-v1`. Same localStorage-only convention as chat history.
- **`RoomStage.tsx` / `RoomDetail.tsx`** — the ultra-HQ single-room viewer behind
  `/rooms/[id]` (replaced the old `Room3DViewer` lightbox): auto-framing
  + cinematic dolly-in, emissive/neon handling, radius-scaled key-light shadows,
  blurred MeshReflectorMaterial floor + baked ContactShadows, MSAA HalfFloat
  composer (UnrealBloom threshold 1.0 + vignette), PerformanceMonitor-driven
  adaptive DPR, poster/progress veil, ←/→ keyboard walk with wrap-around and
  idle-time GLB preload of the neighbouring rooms.
- **`RoomsBrowser.tsx`** — the searchable rooms grid on `/rooms`
  (client-side search over title/architect/series + architect filter chips); each
  card links to its detail page.

**Texture loading (don't regress this).** Artwork textures load through the
same-origin route **`/api/museum/texture?src=…&w=…`**, never directly from media
hosts: `THREE.TextureLoader` needs CORS on *every* redirect hop, and the
transform-in proxy 302s anything it can't transform back to origin hosts that
mostly don't send CORS (plain `<img>` thumbnails are unaffected — which is why the
picker can work while GL textures fail). The route fetches transform-in server-side
(WebP resize + dead-URL revival) with a direct-origin fallback, blocks SSRF
targets, and caches hard. Motion-only works (no still poster) hang as live
`THREE.VideoTexture`s — muted, looped mp4 via transform-in (`artworkVideoUrl`).
Related gotcha: any r3f material that carries a `map` must set `color="#ffffff"`
explicitly — conditional JSX branches reconcile the same material instance and a
stale dark `color` multiplies the texture to black.

**Square-crop media (original-vs-CDN).** OpenSea's conversion CDN
(`i2c.seadn.io`) serves ≤500px variants that are frequently square-CROPPED, and
the historical `nfts.media_info` blobs were probed from them — so both stored
URLs and stored dimensions can describe a crop, not the artwork.
`preferOriginalStill()` in `src/lib/museum/media.ts` swaps those stills for
`response_opensea.original_image_url` at render time and refuses to trust
square conversion-CDN dimensions for aspect ratios (`trustedDims`). The
permanent data fix is `apps/migration/fix-square-media-info.ts`, which
re-probes `media_info` from the original file (dry-run by default; `--write`
needs `DIRECTUS_API_KEY`).

## Tech Stack

- Next.js 16.1.7 (Turbopack, `output: "standalone"`)
- React 19.2.4, TypeScript 5.9.3
- Tailwind CSS 4.2.1, react-markdown 10.1.0 + remark-gfm
- `zod` for route validation
- No database, no auth libs — chat state is `localStorage`, config is env
- Dark-first design system — see **Design system** below. Canonical OKLCh tokens live in `src/app/globals.css`; the legacy hex var names (`--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--border`, `--text-primary`, `--text-secondary`, `--accent`) are kept as aliases over the MOCA tokens.

Use CSS variables for all colors. No light mode. Styling is inline Tailwind + CSS vars.

## Design system

This product uses the **MOCA Library design system** (aka Claude Design). Before building or restyling any UI, read `.claude/skills/moca-library-design/README.md` — the canonical manifesto (visual foundations, voice, motion, iconography). `.claude/skills/moca-library-design/design-system.html` opens a live specimen index of every component. The skill is user-invocable as `/moca-library-design`.

**Non-negotiables:**

- Use MOCA tokens from `src/app/globals.css`. Never invent a new color. The palette is monochrome OKLCh + **one** chromatic accent.
- **One accent per screen.** Accent = primary CTA, active nav, live/running state, citation badges. Not for hover backgrounds, generic highlights, or decoration. The accent comes from the `ACCENT_COLOR` env var; default is `oklch(0.79 0.18 70.67)` (warm yellow-green) defined as `DEFAULT_ACCENT_COLOR` in `src/lib/settings.ts`.
- **Dark mode is primary.** `class="dark"` is set on `<html>` in `layout.tsx`. Test features in dark first.
- **Glass on chrome, not data.** Apply `backdrop-filter: blur(24px)` + translucent bg to sidebars, top nav, composer, modal shells. Content cards use opaque `var(--card)` with a 1px `var(--border)` hairline. Glass-on-glass is forbidden.
- **Type.** Inter Variable for UI, JetBrains Mono for IDs / metadata / timestamps / status chips. Display ≥24px uses `-0.015em` to `-0.02em` tracking; small uppercase labels use `+0.08em` tracking at `font-size: 10.5–11px`.
- **Icons.** Lucide outline only, 1.5–2px stroke, `currentColor`. Size ladder 14/16/20/24px. No emoji in product UI. No Unicode-as-icon — `<ArrowRight />`, not `→`, in icon slots (`→` is fine inline in prose).
- **Radius ladder.** `--radius` (8px) cards/buttons/inputs, `--radius-sm` (4px) inline chips, `--radius-xl` (16px) modals, full-pill for filter chips.
- **Motion.** Entrance 300–400ms `ease-out`; micro-interactions 150–200ms; `active:scale-[0.98]` on primary buttons only. Hover shifts color/border, never position.
- **Voice.** Sentence case, no hype, precise numbers. AI answers open with "Based on *<source>*, …" and every answer shows source chips.

**When building new UI**, lift patterns from `.claude/skills/moca-library-design/preview/*.html` (23 component specimens) or `.claude/skills/moca-library-design/ui_kits/library/*.jsx` (Shell, ManageScreen, ExploreScreen, AskScreen). Match the visual output — you don't need to copy the prototype's internal structure.

## Configuration

All config is read from the container environment — there is no admin UI and no
database. See `.env.example`.

- **Cortex:** `CORTEX_API_URL` + `CORTEX_API_KEY` (single read-only key). Deprecated
  aliases `NEXT_PUBLIC_API_URL` and `LIBRARY_API_URL` are mirrored onto `CORTEX_API_URL`
  at boot in `src/instrumentation.ts` with a console warning.
- **Community submissions (optional — feature is disabled if unset):** `SESSION_SECRET`
  (SIWE cookie HMAC), `LIBRARY_ADMIN_ADDRESSES` (reviewer whitelist, comma-sep),
  `DIRECTUS_SUBMISSIONS_TOKEN` (Directus write token for `library_submissions`),
  `CORTEX_MANAGEMENT_API_KEY` (`cortex_rw_` write key), `CORTEX_COLLECTIVE_COLLECTION`
  (target collection name, default `Collective`). Uses the existing `DIRECTUS_URL` +
  mainnet RPC (for ENS). See "Community submissions & review" above.
- **Branding/analytics (optional, with defaults in `src/lib/settings.ts`):** `APP_TITLE`,
  `APP_DESCRIPTION`, `ACCENT_COLOR`, `LOCALE` (`en`/`de`), `LOGO_URL`, `SUPPORT_URL`,
  `SUPPORT_LABEL`, `CORTEX_ANALYTICS_TEMPLATE`. Surfaced to the client via `/api/config`.
- **Site:** `NEXT_PUBLIC_SITE_URL` (compile-time, SEO/OpenGraph).
- Server-side config must never be prefixed with `NEXT_PUBLIC_` — it stays on the
  server. The app boots even with no `CORTEX_API_KEY` (Library disabled, galleries fine).

## Conventions

- Hex color values must be quoted in `.env` files (e.g. `"#ff9500"`) because `#` is treated as a comment by dotenv
- `NEXT_PUBLIC_` vars are compile-time inlined by Next.js — runtime config uses the `/api/config` endpoint instead
- German UI uses du-form; keep product terms (Deep Research, etc.) in English even in German locale
- Route handlers validate input with `zod`. There are no auth gates — every Library route is public.
- Static editorial content lives in `src/content/*.json` (writings, timeline, incubator, manifesto, press-room, moca-live), rendered by Server Components + a client browser component. The **MOCA Live** (`/moca-live`) streams and **Press Room → Artist Interviews** lists are scraped from YouTube and refreshed with `node scripts/scrape-youtube.mjs` — see `scripts/README.md`.
