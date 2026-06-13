# MOCA × Hyperfy

Walk into your own exhibitions. This package connects the museum's world
builder to [Hyperfy](https://github.com/hyperfy-xyz/hyperfy) — the open-source,
self-hostable virtual world engine — so curations made at
`museumofcryptoart.com/rooms/world` become real, multiplayer, walkable
3D spaces.

**Privacy by design:** curation data lives in the curator's browser
(localStorage). Nothing reaches a Hyperfy world until the curator explicitly
spawns — from the builder's **Spawn to Hyperfy** dialog (browser → world,
straight) or by exporting `*.moca-exhibition.json` and running the CLI. Either
way the only things needed are a **world URL** and the world's **admin key**
(its `ADMIN_CODE`).

## The pipeline

```
world builder (browser, localStorage)
   ├─ Spawn to Hyperfy ──────────────┐    world URL + admin key
   └─ Export → my-show.moca-exhibition.json
        └─ spawn-exhibition.mjs ─────┴──▶ Hyperfy v2 world (walkable, multiplayer)
```

The exhibition format carries everything: a stable exhibition `id`, room GLB
URLs, placements (position/rotation/**curator room sizing**), per-room GLB
measurements (`footprint`, `groundOffset`), per-slot artworks with
CORS-enabled texture URLs, true aspect ratios, video URLs for motion works,
the curator's move/resize overrides — and the exhibition's **spawn point**
(set in the builder's Exhibits tab; the spawner walks its own player there
and runs `/spawn set`, so visitors always enter where the curator intended).

**Layout translation.** The builder normalizes every room onto an 8-unit
tile (scaled to fit, centered, floor at y=0); Hyperfy renders GLBs at native
size and pivot. The spawners reproduce the builder's exact layout from the
exported measurements: each room is scaled so one tile maps to
`--tile-size` meters (default 16) and positions convert with it — artworks
and placards stay metric inside the scaled rooms. Exports made before the
measurements existed spawn at native scale with a warning; rooms spawned by
older spawner versions are healed to the normalized layout on the next
spawn.

**Modular.** Every placed room becomes its own Hyperfy app. Its generated
script hangs the curated works on **baked slot anchors** — the export carries
every slot's GLB-local transform + frame size as measured by the builder, so
hanging works even for slots that never exist as GLB nodes (un_MUSEUM rooms
generate their `Auto_NNN` slots at builder runtime). Works letterbox into
their slot frames exactly like the museum renders them — true aspect ratio,
curator move/resize overrides — images as planes, motion works as live
spatial video, optional title/artist placards. The artworks are **child nodes
of the room app**, so they stay attached to their room no matter how admins
rearrange things in-engine.

**Self-contained.** Curated images are fetched and uploaded into the world as
content-addressed assets at spawn time — the exhibition keeps rendering even
if museum infrastructure is unreachable. (Videos stay remote: they can be
huge and stream fine.)

**Refinable in-engine.** Each room app ships an inspector panel
(`app.configure`): artwork scale, wall gap, placards on/off, art lighting,
video volume, slot editing. Any admin (`/admin <code>` in the world chat)
presses Tab, right-clicks a room, and tunes it — live, for everyone. Rooms
arrive **unpinned**: grab one to move it, X deletes it, the curation travels
with it (spawn with `--pinned` / "Lock layout" to protect the arrangement;
P toggles a room's pin in-world).

**Per-slot refinement in-world.** Slot editing is **on by default**:
builders/admins hold **E** at any hung work to edit it in place: arrow
keys nudge it along the wall (Shift = faster), the scroll wheel resizes, R
resets, Enter/Esc finishes. Every change syncs live to everyone, is
rank-checked server-side, and persists in the world's `storage.json` keyed by
the room's deterministic entity id — so slot refinements survive server
restarts, blueprint rebuilds AND museum curation re-spawns. (The engine
sandbox can't write blueprints, so world storage is the engine-sanctioned
persistence path — see `lib/room-script.mjs`.)

**Idempotent.** Blueprint/entity ids derive from the exhibition id, so
spawning again **updates the same rooms in place**: curation changes flow in
from the museum, while room arrangements and prop tweaks made in-engine are
preserved. (`--relayout` snaps rooms back to the museum layout; `--fresh`
spawns an independent copy.) Every spawn ends with a verification pass that
reconnects and confirms the world really has every room — a wrong admin key
fails loudly, not silently.

## The museum guide (agentic VRM avatar)

Spawn with `--guide` (or tick **Museum guide** in the browser dialog) and the
exhibition arrives with a resident: a VRM avatar visitors **hold E** to talk
to. Click a suggested question, or just type yours in the world chat while
standing near it — every conversation is **private and per-player**
(`app.sendTo`), with the running history riding along so the guide reacts to
the dialogue, not just the last question.

```
visitor ──E / chat──▶ guide app (server script) ──▶ MOCA API /v1/guide/ask
                                                      ├─ exhibition context
                                                      │  (rooms · architects ·
                                                      │   artists · works)
                                                      ├─ Cortex Library (RAG)
                                                      └─ DeCC0 persona (Codex)
```

Spawning a guide is the one step that **does** send exhibition data to MOCA
servers: the spawner registers the curation's skeleton (room + artwork ids)
with `POST /v1/guide/exhibitions`, where it's enriched from the museum's own
data — room architect/description/series, artwork artist/description — into
the context the guide answers from. Question starters come from Cortex (plus
deterministic templates as instant fallback), get baked into the app for
offline resilience, and rotate with every answer.

- `--guide-name <name>` — display name (default **Tsahafi**)
- `--guide-avatar <path|url>` — any `.vrm`; defaults to the in-repo
  `omnimorph-3321.vrm` (the museum's default body until the first Art DeCC0
  VRMs land — the site's catalog lives at
  `museumofcryptoart.com/avatars/avatars.json`)
- `--decc0 <token id>` — the guide adopts that Art DeCC0's SOUL (from the
  MOCA Codex via `/v1/decc0s/:id?include=profiles`); also refinable in-world
  via the guide's App pane (right-click in build mode). Default 4209 —
  **Tsahafi**, the scholar-curator.
- `--soul <file.md>` / `--soul-name <name>` — bring ANY agent's SOUL.md and
  the guide embodies it (baked into the app; editable later in its
  inspector). Beats `--decc0`.
- `--soulweaver <chainId:0xcontract:tokenId>` — a Soulweaver soul; the
  EIP-191-signed SOUL file is resolved by the MOCA API at answer time.
- `--api <url>` — MOCA API base (default `https://api.moca.qwellco.de`)

In the museum world builder the same controls live in the sidebar's
**Exhibits tab → Museum guide** button: search the 10,000 DeCC0s by name
(live from the public Codex), point at a Soulweaver token, or upload a
SOUL.md — then **Send into exhibition** (spawns/updates just the guide in
the world the rooms went to) or download it as a `.hyp`.

The guide is idempotent like the rooms — deterministic ids from the
exhibition key, so re-spawning pushes new knowledge/avatar while keeping
wherever admins placed it. Agent-side, the same endpoints are documented as
the Cortex-installable **museum-guide skill**:
https://docs.museumofcryptoart.com/skills/museum-guide/SKILL.md

### …or as a drag-droppable app (`.hyp`)

No world URL, no admin key, no spawner run — bundle the guide as a portable
Hyperfy app file and hand it to anyone:

```bash
node build-guide-app.mjs my-show.moca-exhibition.json --decc0 4209 -o guide.hyp
```

(or click **Download guide app (.hyp)** in the builder's Spawn dialog). Drop
the file into any world in build mode (Tab → drag it onto the window) and the
guide stands where you dropped it, VRM + script bundled
(`lib/hyp.mjs` mirrors the engine's `.hyp` exporter; browser twin
`apps/museum/src/lib/museum/hyperfy/hyp.ts`). Building the file is the
registration moment — the exhibition context is sent to the MOCA API then,
not at drop time. The dropped app is retargetable in its inspector:
exhibition id, persona, name and API are all props.

## Spawn an exhibition (CLI)

```bash
cd apps/hyperfy && npm install     # msgpackr + ws — that's the whole setup

node spawn-exhibition.mjs my-show.moca-exhibition.json \
  --url https://your-world.example.com \
  --key YOUR_ADMIN_CODE
```

No Hyperfy checkout needed: the spawner speaks the engine's wire protocol
directly (`lib/protocol.mjs`, pinned to Hyperfy **v0.16.0** packet ids — bump
the table there if the engine's `src/core/packets.js` changes). Options:
`--tile-size` (meters one builder tile maps to, default 16 — room size and
spacing together), `--art-size` (base artwork meters, also the per-room
inspector default), `--pinned` (lock the layout; rooms arrive grabbable by
default), `--relayout`, `--fresh`, `--no-verify`,
`--name`.

Browser path: the same logic lives in
`apps/museum/src/lib/museum/hyperfy/` (protocol + room-script twins — keep
them in sync) behind the builder's Spawn dialog.

## Host worlds

- **One world, full guide:** [`world-template/`](world-template/README.md) —
  the deployable "MOCA world template" (official engine image, pinned
  version, env + volume + backup story). Hand the URL + admin key to a
  curator and the world receives exhibitions.
- **Many worlds:** `docker-compose.worlds.yml` — one isolated service per
  exhibition/curator (own SQLite, assets, admin code) behind your proxy.

## Teach the agents Hyperfy

```bash
node harvest-hyperfy-docs.mjs --hyperfy ../hyperfy \
  --cortex https://library.moca.qwellco.de --key cortex_rw_…
```

Ingests the official Hyperfy docs (the repo's `docs/` is the source of
docs.hyperfy.xyz) into a Cortex collection. After that, the MOCA Library —
including the chat widget on docs.museumofcryptoart.com and every
`/v1/library/ask` consumer — answers Hyperfy questions with citations, and
agents can help curators script their worlds. (This is the one script that
still wants a Hyperfy checkout, for its `docs/` folder.)

## Related

- Museum world builder: `apps/museum` → `/rooms/world` (Spawn + Export live
  in the Exhibits tab)
- MOCA API: `GET /v1/rooms` (the GLB catalog), `GET /v1/artworks` (media)
- Docs: https://docs.museumofcryptoart.com/hyperfy (pipeline guide) ·
  agent skill: https://docs.museumofcryptoart.com/skills/exhibitions/SKILL.md
- Engine: https://github.com/hyperfy-xyz/hyperfy (GPL-3.0; we drive it over
  the network, unmodified)
