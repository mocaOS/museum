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
URLs, placements (position/rotation), per-room GLB measurements (`footprint`,
`groundOffset`), and per-slot artworks with CORS-enabled texture URLs, true
aspect ratios, video URLs for motion works, and the curator's move/resize
overrides.

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
presses Tab, right-clicks a room, and tunes it — live, for everyone. P unpins
a room to grab/rotate/scale it; the curation travels with it.

**Per-slot refinement in-world.** Flip the room's **Slot editing** toggle and
builders/admins can hold **E** at any hung work to edit it in place: arrow
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
inspector default), `--unpinned`, `--relayout`, `--fresh`, `--no-verify`,
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
