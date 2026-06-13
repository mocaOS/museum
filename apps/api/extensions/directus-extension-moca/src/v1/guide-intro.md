# How the Museum of Crypto Art and its exhibitions work

This is your background briefing as the museum's in-world guide. It explains what MOCA is, how its 3D exhibitions are built and spawned into walkable worlds, and how rooms and artworks are organized. Use it to orient visitors and connect what they see to the wider museum. Treat the live exhibition facts you are given as authoritative over anything here.

## What the Museum of Crypto Art is

Welcome to the **MOCA API** — the unified public interface of the
[Museum of Crypto Art](https://museumofcryptoart.com). One API key gives your
software structured access to the whole MOCA universe:

| Surface | What you get |
| --- | --- |
| **Collections** | The museum's published collections and their hierarchy |
| **Artworks** | Every artwork with normalized, *original-ratio* media URLs |
| **Rooms** | The 3D exhibition architecture as GLB models with artwork slots |
| **Art DeCC0s** | The 10,000-entity DeCC0s knowledge base, aggregated from [api.decc0s.com](https://docs.decc0s.com) |
| **Search** | One query across all of the above |
| **Library** | RAG Q&A and hybrid search over the museum's knowledge base — answers with citations ([guide](/library)) |
| **Souls** | EIP-191-signed agent identity documents per NFT, ready for ERC-8004/8183/8257 ([guide](/web3)) |
| **Hyperfy** | Spawn curated exhibitions into walkable multiplayer worlds ([guide](/hyperfy)) |
| **Skills** | Ground-truth `SKILL.md` files + [`llms.txt`](/llms.txt) for your AI agents ([handbook](/skills)) |

## Base URL

```
https://api.moca.qwellco.de/v1
```

## Design principles

**One key, one surface.** The MOCA API aggregates several backends — the
museum's Directus CMS and the Art DeCC0s knowledge base — behind a single
authenticated endpoint, so you never juggle multiple credentials or base URLs.

**The artwork, not a thumbnail.** Historic NFT pipelines are littered with
square-cropped CDN variants. The MOCA API resolves every artwork to its
**original file** where one survives, revives dead hosts, and only reports an
aspect `ratio` it can actually trust. Render `media.url` at `ratio` and you're
showing the work the way the artist made it.

**Familiar conventions.** Responses use the Directus-style envelope —
`{ "data": …, "meta": … }` on success, `{ "errors": [...] }` on failure — the
same conventions as the [DeCC0s API](https://docs.decc0s.com), so moving
between the two feels seamless.

  Grab your key and make your first call in the [Quickstart](/quickstart).

## Need an API key?

API keys are issued by the MOCA team. Reach out through
[museumofcryptoart.com](https://museumofcryptoart.com) and tell us what you're
building — we love seeing the collection travel.

## How exhibitions become walkable worlds

Anyone can curate a museum at
[museumofcryptoart.com/rooms/world](https://museumofcryptoart.com/rooms/world)
— place 3D rooms, hang artworks, resize and arrange them. With the
[Hyperfy](https://github.com/hyperfy-xyz/hyperfy) integration, that curation
becomes a **walkable, multiplayer world**: provide a world URL and its admin
key, and the whole exhibition spawns into the Hyperfy v2 world of your choice.

  Curation data never leaves the curator's device on its own. The world
  builder stores everything in browser localStorage; spawning — from the
  builder's dialog or the CLI — is the explicit upload moment, and the
  exhibition travels directly from the curator to the world they chose,
  never through museum servers.

## From curation to world

1. **Curate**

   Build the exhibition in the world builder: place rooms, hang artworks,
   adjust each piece. Everything autosaves locally.

1. **Get a world**

   Any self-hosted Hyperfy v2 world works. Deploying your own takes one
   docker-compose file — the **MOCA world template** in
   `apps/hyperfy/world-template/` pins the engine version, sets sane
   defaults, and documents the whole operate/backup story. You need two
   values: the **world URL** and the **admin key** (the world's
   `ADMIN_CODE`).

1. **Spawn**

   In the builder's **Exhibits** tab hit **Spawn to Hyperfy**, paste URL +
   key, spawn. Or use the exported file with the CLI:

   ```bash
   cd apps/hyperfy && npm install
   node spawn-exhibition.mjs my-show.moca-exhibition.json \
     --url https://your-world.example.com --key YOUR_ADMIN_CODE
   ```

   No engine checkout needed — the spawner speaks Hyperfy's wire protocol
   directly. Every spawn ends with a verification pass confirming the world
   really received every room.

1. **Walk in & refine**

   Open the world in a browser — it's multiplayer, bring people. Admins
   refine in-engine (see below); curators push updates by spawning again.

## Modular by design

Every placed room arrives as **its own Hyperfy app**: the room GLB plus a
generated script that hangs the curated works onto the model's `Slot_NNN`
nodes — images as planes at true aspect ratio, motion works as live spatial
video, optional title/artist placards. Artworks are **child nodes of their
room**, so a room can be grabbed, rotated, even duplicated in-engine and its
curation stays attached, always.

The builder's layout translates faithfully: it arranges rooms on uniform
tiles (every model normalized to fit one), and the spawner reproduces that —
each room is scaled so a tile spans a configurable number of meters
(**Room size**, default 16 m; `--tile-size` on the CLI), positions convert
with it, and artworks stay at their metric size inside the scaled rooms.

Spawning is **idempotent**: blueprint and entity ids derive from the
exhibition's stable id, so re-spawning updates the same rooms in place.
Curation changes flow in from the museum; the arrangement and tuning done
inside the engine survive. (`--relayout` reapplies the museum room layout;
`--fresh` spawns an independent copy.)

## Refining in-engine

Anyone holding the admin key types `/admin <code>` in the world chat, then:

- **Tab** toggles build mode.
- **Right-click a room** opens its inspector. The **App pane** holds the
  curation controls every room ships with: artwork size, wall gap, placards,
  art lighting (unlit true-color vs world-lit), video volume. Changes apply
  live for everyone.
- **P** unpins a room (rooms spawn pinned so visitors can't drag them); then
  grab to move, **1–4** for translate/rotate/scale modes, **R** duplicates,
  **X** deletes.
- **Per-slot editing, in place:** flip the room's **Slot editing** toggle,
  then hold **E** at any hung work — arrow keys nudge it along the wall
  (Shift = faster), the scroll wheel resizes, R resets, Enter finishes.
  Changes sync live to everyone in the world, are permission-checked
  server-side, and persist in the world itself — they survive server
  restarts and even curation re-spawns from the museum.
- Right-click → **Download** exports any room as a portable `.hyp` file.

Both refinement layers and the museum builder compose: museum data defines
the curation, the inspector tunes the room's mood, and slot editing
fine-places individual works — pushing a curation update from the museum
never wipes what was refined in-world.

## Host worlds

Each Hyperfy world is one lightweight container with its own database,
assets, and admin key — perfect isolation per exhibition or curator.

- Single world: `apps/hyperfy/world-template/` (deploy guide included).
- Many worlds: `apps/hyperfy/docker-compose.worlds.yml` — copy a service
  block per world, point subdomains at the ports, hand each curator their
  key. Self-hosters need nothing but Docker.

## The slot convention (build your own renderer)

Rooms from `GET /v1/rooms` ship as GLBs whose `Slot_001…Slot_NNN`
placeholder quads define where art hangs — use `model_optimized_url`, which
always carries them (un_MUSEUM sculptures get theirs generated from the
onchain slot amount; `model_url` is the untouched HQ original) — transform = anchor, bounding box = frame
size, `slots` field = count. Hide the placeholder, place the work at its
transform, fit preserving `ratio`. That single convention powers the museum
site, the Hyperfy integration, and whatever you build next.

## Agents that know Hyperfy

Run `apps/hyperfy/harvest-hyperfy-docs.mjs` to ingest the official
[docs.hyperfy.xyz](https://docs.hyperfy.xyz) content into the
[Library](/library). From then on `/v1/library/ask` — and the chat widget on
this very site — answers Hyperfy scripting and world-building questions with
citations, so curators and their agents can collaborate on richer worlds:
custom interactions, scripted openings, generative scenography.

For agent ground truth, fetch the skill:
`https://docs.museumofcryptoart.com/skills/exhibitions/SKILL.md`.

## Exhibitions, rooms & the slot convention

# Skill: Exhibitions & Hyperfy

The museum's 3D architecture, the slot convention, and spawning walkable
multiplayer exhibitions into Hyperfy worlds.

## Rooms

```bash
curl -H "X-API-Key: $KEY" "https://api.moca.qwellco.de/v1/rooms"
```

→ `{ id, title, architect, series, slots, image_url, model_url, model_optimized_url, slot_data_url }`.
Use `model_optimized_url` — a draco-compressed GLB that always carries slots
(un_MUSEUM sculptures get theirs generated from the onchain slot amount);
`model_url` is the untouched HQ original. **The convention:** the model contains
placeholder quads named `Slot_001 … Slot_NNN` (material "Slot Placeholder").
Their transforms are the wall anchors; their bounding boxes the frame sizes;
`slots` is the count. Hide the placeholders, hang art at their transforms,
fit each work preserving its `ratio` (letterbox inside the slot).

**Don't trust a placeholder's raw normal** — some are authored facing into
their wall. Prefer the baked slot data (public, no key needed):

```bash
curl "https://api.moca.qwellco.de/v1/rooms/3/slots"
```

→ `{ version, room, model, slots: [{ id, index, source, position, quaternion,
width, height, facing, flipped, ambiguous }] }`, room-local GLB units. Each
`quaternion` is already facing-resolved (local +Z points at the viewer, +Y
upright — computed by probing the room geometry on both sides of every slot),
so hang works on it verbatim. `model` is the Directus file id the data was
computed from — compare it against the room's current model before trusting
the anchors. Null `slot_data_url` = not baked yet; fall back to the
placeholder transforms.

## The exhibition format

Visitors curate at `museumofcryptoart.com/rooms/world` (data stays in
their browser). Export produces `*.moca-exhibition.json`:

```json
{
  "format": "moca-exhibition@1",
  "id": "stable-uuid",                                     // identity for idempotent re-spawns
  "spawn": { "position": [x, 0, z], "rotationY": 1.57 },   // optional: where visitors enter
  "placements": [{
    "uid": "p0",
    "room": {
      "id", "title", "modelUrl",
      "footprint": 38.2,            // max(bbox x,z) of the GLB, raw units
      "groundOffset": [x, y, z]     // (-center.x, -bbox.min.y, -center.z), raw units
    },
    "position": [x, 0, z], "rotationY": 0.785,   // tile space: 8 units = one room tile
    "scale": 1.2,                                // curator room sizing (default 1)
    "slots": [{                                  // baked anchors, GLB-local —
      "id": "Slot_001",                          // works for Auto_NNN too (un_MUSEUM
      "position": [x, y, z],                     // slots exist only at builder runtime,
      "quaternion": [x, y, z, w],                // never as GLB nodes)
      "width": 1.4, "height": 1.0                // frame size; art letterboxes into it
    }],
    "artworks": [{
      "slotId": "Slot_001", "name", "artist", "ratio": 0.72,
      "imageUrl": "https://…/api/museum/texture?src=…",   // CORS-enabled
      "videoUrl": null,                                    // mp4 for motion works
      "override": { "dx": 0, "dy": 0, "scale": 1.3 }       // curator adjustments
    }]
  }]
}
```

The file is device-local until the curator chooses to upload — that's the
privacy contract.

## Spawn into Hyperfy

Two inputs: the world URL + its admin key (`ADMIN_CODE`). Either the world
builder's **Spawn to Hyperfy** dialog (Exhibits tab — browser → world,
direct), or the CLI in the museum monorepo under `apps/hyperfy`:

```bash
cd apps/hyperfy && npm install     # no Hyperfy checkout needed
node spawn-exhibition.mjs my-show.moca-exhibition.json \
  --url https://world.example.com --key CODE
```

Flags: `--tile-size 16` (meters one builder tile maps to — the builder
normalizes every room onto an 8-unit tile; the spawner reproduces that layout
by scaling each room to `tileSize/footprint` and converting positions by
`tileSize/8`, offset by the rotated `groundOffset·scale`), `--art-size 2`
(base meters, also the in-world inspector default), `--pinned` (lock the
layout — rooms arrive unpinned/grabbable by default),
`--relayout` (reapply museum room positions), `--fresh` (independent copy),
`--no-verify`. Generated scripts receive the room's `rootScale` and divide
meter values by it, so artwork/placard sizes stay metric inside scaled rooms.

Semantics: each room = one Hyperfy app (model + generated script); artworks
hang on baked slot anchors (works for `Auto_NNN` slots that never exist as
GLB nodes) as child nodes of the room, so they stay attached when rooms
move; curated images are uploaded into the world as content-addressed
assets (videos stay remote). Each room's script exposes `app.configure`
fields (artwork scale, wall gap, placards, lighting, video volume, slot
editing) — admins refine in-engine via right-click → App pane. Blueprint/
entity ids are deterministic uuids from `exhibition.id + placement.uid`, so
re-spawning UPDATES rooms in place (blueprint version bump) and never
touches positions admins set in-world. A post-spawn verification reconnects
and confirms every room exists — a wrong key fails loudly.

In-world slot editor (embedded in the generated script): with the room's
"Slot editing" prop on (the default), builders/admins hold E at a work, nudge with
arrows, resize with scroll, R resets, Enter finishes. Protocol: client sends
app event `moca:adjust {slot, dx, dy, s}` (or `{slot, reset:true}`); the
server validates sender rank (`world.getPlayer(networkId).builder`), clamps
to the museum's limits, persists via `world.set('moca:slots:'+app.instanceId)`
→ the world's `storage.json` (restart/rebuild/re-spawn-safe — entity ids are
deterministic), mirrors into `app.state.adjust` for late joiners, and
rebroadcasts `moca:adjust` (plus `moca:adjust:init` with the full map after
every rebuild). Adjustments layer multiplicatively on top of museum curation
overrides. Engine scripts cannot write props/blueprints — world storage is
the sanctioned persistence path.

Under the hood (if you reimplement — see `apps/hyperfy/lib/protocol.mjs`,
pinned to Hyperfy v0.16.0): upload assets via `POST {world}/api/upload`
(filename = sha256 hex + ext, check `/api/upload-check?filename=` first;
HTTP API is CORS-open), then over `{world}/ws` send msgpackr-packed
`[packetId, data]` frames: `command {args:["admin", CODE]}` for builder rank
(connect anonymously — the admin command toggles), `blueprintAdded` /
`blueprintModified` (version must increase) and `entityAdded` (position,
yaw→quaternion, `pinned: false` by default — rooms arrive grabbable). The generated app script does
`app.get('Slot_001')`, hides it, parents an `image`/`video` node with the
artwork's ratio and overrides, plus an optional `ui` placard.

## Host worlds

One Hyperfy container per world (own SQLite + assets + ADMIN_CODE).
`apps/hyperfy/world-template/` is the deployable single-world template
(official `ghcr.io/hyperfy-xyz/hyperfy` image, pinned engine version, full
deploy/backup guide); `apps/hyperfy/docker-compose.worlds.yml` hosts many —
isolate each curator's world, point subdomains at the ports.

## The museum guide

Spawn with `--guide` (CLI) or the dialog's **Museum guide** toggle and the
exhibition arrives with an agentic VRM avatar visitors hold **E** to talk to
— per-player Q&A about the rooms, architects, artists, and works, answered by
the public `/v1/guide/*` endpoints (exhibition context + Cortex + optional
Art DeCC0 persona). Full endpoint reference, including registering contexts
and asking questions from your own agent:
`/skills/museum-guide/SKILL.md` (Cortex-installable).

## Teach your agent Hyperfy

`apps/hyperfy/harvest-hyperfy-docs.mjs` ingests the official Hyperfy docs
into the MOCA Library — then `/v1/library/ask` (scoped to the Hyperfy
collection) answers scripting/world questions with citations. Hyperfy's own
docs: https://docs.hyperfy.xyz

## How the museum guide answers visitors

# Skill: Museum Guide

Be the museum guide. Every exhibition spawned from MOCA's world builder into a
Hyperfy world with a guide registers its **context** — rooms, their architects,
every exhibited artist and work — with the MOCA API. This skill teaches you to
read that context, suggest questions a visitor might ask, and answer them the
way the in-world guide does. The very first public exhibit is **“Echoes of the
Mind”**.

Base URL: `https://api.moca.qwellco.de`

The four guide endpoints below are **public — no API key required** (they power
anonymous in-world visitors). Deep-dive endpoints in the last section need a
MOCA key sent as `X-API-Key: MOCA_API_KEY`.

## The exhibition context

```bash
curl "https://api.moca.qwellco.de/v1/guide/exhibitions/echoes-of-the-mind"
```

→ `{ "data": { id, name, registeredAt, rooms: [{ uid, id, title, architect,
description, series, artworks: [{ id, title, artist, description, collection }] }],
artists: [...], architects: [...], counts: { rooms, artworks, artists },
starters?: [...] } }`

This is the authoritative record of what hangs where: each room carries its
architect and description from the museum's own data, each artwork its artist
and description. `starters` (when present) are Cortex-generated visitor
questions. 404 means the exhibition hasn't been registered — exhibitions are
registered automatically when a curator spawns them with a guide. The `id` is
the exhibition's stable identity from the world builder (ask the curator, or
read it from their `*.moca-exhibition.json` export).

## Suggest questions to a visitor

```bash
curl "https://api.moca.qwellco.de/v1/guide/exhibitions/echoes-of-the-mind/suggestions?seed=7"
```

→ `{ "data": { exhibition, suggestions: ["…?", "…?", "…?"] } }`

Deterministic per seed — vary `seed` to rotate through the pool (Cortex
starters + questions templated from the works, artists, rooms, and architects
actually in the exhibition).

## Answer a visitor's question

```bash
curl -X POST "https://api.moca.qwellco.de/v1/guide/ask" \
  -H "Content-Type: application/json" \
  -d '{
    "exhibition": "echoes-of-the-mind",
    "session": "visitor-42",
    "question": "Who designed this room, and what should I look at first?",
    "history": [{"role":"user","content":"…"},{"role":"assistant","content":"…"}],
    "decc0": 1,
    "visitor": "rene"
  }'
```

→ `{ "data": { answer, persona, suggestions, mode, sources?, audioUrl?, fallback? } }`

The guide runs a **hybrid** conversation model. When the deployment has a fast
agent configured, each reply is a direct, reactive LLM answer (`mode: "fast"`)
grounded in the exhibition context + an aggregated "how MOCA exhibitions work"
brief + your **session memory**; the Cortex Library (RAG over MOCA's writings,
lore, and artist interviews) then mines deeper insights **asynchronously** into a
separate bucket that enriches your *next* reply — so the conversation gets more
specific as it goes. Pass a stable **`session`** id (per visitor) to get that
memory; without it you still get a fast stateless reply. Otherwise the guide
answers Cortex-first (`mode: "cortex"`). Optional fields: `history` (the running
conversation, last ~8 turns, a fallback when no `session` memory exists) and
`visitor` (display name); `speak` (default true) + `voice` (a Venice voice id,
e.g. `Serena`) request spoken audio — when the deployment has TTS configured the
response carries an **`audioUrl`** (an mp3 served from `GET /v1/guide/tts/:id.mp3`)
you can play back. Plus **who answers** — first match wins:

- `soul` (string) — a complete SOUL.md the guide embodies, with optional
  `soulName`;
- `soulRef` — `{ "chainId": 1, "address": "0x…", "tokenId": "42" }`, a
  Soulweaver soul (EIP-191-signed SOUL files; resolved server-side);
- `decc0` — an Art DeCC0 token id 1–10000 (its **SOUL.md** from the MOCA
  Codex);
- nothing — the default guide, DeCC0 **#2875 Oblak**, the cryptoart guide.

`fallback: true` flags an answer built from context alone (Library
unreachable). Rate limit ~20/min per IP — pace a conversation, don't batch.

## Register an exhibition (spawners do this for you)

```bash
curl -X POST "https://api.moca.qwellco.de/v1/guide/exhibitions" \
  -H "Content-Type: application/json" \
  -d '{
    "format": "moca-exhibition@1",
    "id": "echoes-of-the-mind",
    "name": "Echoes of the Mind",
    "placements": [{
      "uid": "p0",
      "room": { "id": 12, "title": "Genesis Hall" },
      "artworks": [{ "id": 3402, "name": "…", "artist": "…" }]
    }]
  }'
```

→ `{ "data": { id, name, counts, architects, artists, suggestions } }`

Send room/artwork **ids** when you have them — the API enriches architect,
descriptions, and artist data from the museum's own collections (names alone
still work, just shallower). Registration is idempotent (same id overwrites)
and re-running it refreshes the context after a re-curation. The world
builder's "Spawn to Hyperfy" dialog and `apps/hyperfy/spawn-exhibition.mjs
--guide` call this automatically.

## Go deeper (key-gated MOCA API)

When a visitor wants more than the exhibition context holds:

- `GET /v1/artworks/:id` — full artwork media + metadata
- `GET /v1/rooms` — every museum room: `architect`, `series`, GLB models
- `GET /v1/decc0s/:id?include=profiles` — the full Art DeCC0 character:
  `agent_profiles` (ready ElizaOS character file) and its **SOUL.md /
  IDENTITY.md** — this is what `decc0` personas are built from
- `POST /v1/library/ask` — `{ "question": "…" }` direct museum RAG with
  citations, no exhibition framing

Auth for these: `X-API-Key: MOCA_API_KEY` (request a key from the MOCA team).
Envelope everywhere: `{ "data": …, "meta"? }` / `{ "errors": [{ "message",
"extensions": { "code" } }] }`.

## Notes

- The in-world guide is a VRM avatar in Hyperfy (hold **E** to talk; typed
  chat near the guide is heard as questions). Its server-side script calls
  exactly the endpoints above — anything you build on them behaves
  identically to the in-world experience.
- The guide also ships as a **portable `.hyp` app file** — built by the
  world builder's "Download guide app" button or
  `apps/hyperfy/build-guide-app.mjs` — that curators drag-drop into any
  Hyperfy world in build mode. Its exhibition id / DeCC0 persona / API are
  inspector props, so one file can be retargeted to any registered
  exhibition.
- Default avatar is **Oblak**, Art DeCC0 #2875 (`museumofcryptoart.com/avatars/decc0.vrm`);
  the catalog at `/avatars/avatars.json` grows as DeCC0 VRMs are produced.
- Spawning a guide is the curator's explicit opt-in to publish the
  exhibition context to the MOCA API — exports without a guide never leave
  the curator's device.

## How the museum's data & 3D rooms are built

The MOCA API is the public face of the museum's tech stack. Understanding the
pieces helps you predict freshness, latency, and media behavior.

```
                        ┌──────────────────────────────┐
  your software ──────▶ │  MOCA API  (/v1, API keys)   │
                        │  api.moca.qwellco.de         │
                        └──────┬──────────────┬────────┘
                               │              │ aggregates (cached ~5 min)
                  ┌────────────▼───┐   ┌──────▼─────────────┐
                  │ MOCA Directus  │   │ DeCC0s Directus    │
                  │ collections,   │   │ api.decc0s.com     │
                  │ nfts, rooms    │   │ 10,000 codex items │
                  └────────────────┘   └────────────────────┘
```

## The museum CMS

Collections, artworks, and 3D rooms live in the museum's Directus instance.
Artwork records are continuously enriched from OpenSea (metadata, media URLs,
listings) by background jobs, and a curation pipeline re-probes media against
the **original files** so dimensions describe the artwork, not a CDN
thumbnail.

## Media normalization

NFT media URLs rot: hosts die, CDNs re-encode, originals move. Every artwork
response goes through a normalization layer:

1. **Dead-host revival** — URLs on dead hosts (e.g. `openseauserdata.com`)
   are swapped for live equivalents from the work's marketplace record.
2. **Original-file preference** — OpenSea's conversion CDN serves ≤500px
   variants that are frequently square-cropped. Where the original file
   survives, `media.url` points at it instead.
3. **Trustworthy ratios** — `ratio` is only computed from dimensions that
   describe the real artwork. A square that's actually a crop never reaches
   you as `ratio: 1`; unknown stays `1` and the media file itself is the
   source of truth.
4. **IPFS resolution** — `ipfs://` URIs arrive resolved to a public gateway.

  Treat `width`/`height`/`ratio` as a strong hint for layout, then (if your
  renderer allows) let the decoded file's true pixel size win. That's exactly
  what the museum's own 3D world builder does.

## 3D rooms

Rooms are GLB files authored for the museum's exhibition system. Each model
carries placeholder meshes named `Slot_001 … Slot_NNN` (material
`Slot Placeholder`): flat quads on the walls whose transforms define where —
and at what size — artworks hang. The `slots` field on the room record tells
you how many to expect. You can build your own gallery experience from the
same models the museum uses at
[museumofcryptoart.com/exhibitions/world](https://museumofcryptoart.com/exhibitions/world).

## Art DeCC0s aggregation

The DeCC0s knowledge base — 10,000 richly-written agent personas — lives on
its own Directus instance ([docs.decc0s.com](https://docs.decc0s.com)). The
MOCA API aggregates it:

- responses are cached server-side for ~5 minutes
- Directus file UUIDs are resolved to absolute `*_url` asset links
- the multi-hundred-KB persona blobs (`agent_profiles` and the **SOUL.md**) only
  ship when you ask for them (`include=profiles`)
- each token's **codex lore document** can be embedded with `include=codex`

You can always go straight to the DeCC0s API with its own conventions; the
MOCA API exists so most integrations only need one key and one base URL.

## Freshness summary

| Data | Typical freshness |
| --- | --- |
| Collections, rooms | Hours (editorial changes) |
| Artworks | Hours (background OpenSea sync) |
| DeCC0s | ≤5 minutes behind api.decc0s.com |
