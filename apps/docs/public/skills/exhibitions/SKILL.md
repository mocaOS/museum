# Skill: Exhibitions & Hyperfy

The museum's 3D architecture, the slot convention, and spawning walkable
multiplayer exhibitions into Hyperfy worlds.

## Rooms

```bash
curl -H "X-API-Key: $KEY" "https://api.moca.qwellco.de/v1/rooms"
```

→ `{ id, title, architect, series, slots, image_url, model_url, model_optimized_url }`.
Use `model_optimized_url` — a draco-compressed GLB that always carries slots
(un_MUSEUM sculptures get theirs generated from the onchain slot amount);
`model_url` is the untouched HQ original. **The convention:** the model contains
placeholder quads named `Slot_001 … Slot_NNN` (material "Slot Placeholder").
Their transforms are the wall anchors; their bounding boxes the frame sizes;
`slots` is the count. Hide the placeholders, hang art at their transforms,
fit each work preserving its `ratio` (letterbox inside the slot).

## The exhibition format

Visitors curate at `museumofcryptoart.com/rooms/world` (data stays in
their browser). Export produces `*.moca-exhibition.json`:

```json
{
  "format": "moca-exhibition@1",
  "id": "stable-uuid",                                     // identity for idempotent re-spawns
  "placements": [{
    "uid": "p0",
    "room": {
      "id", "title", "modelUrl",
      "footprint": 38.2,            // max(bbox x,z) of the GLB, raw units
      "groundOffset": [x, y, z]     // (-center.x, -bbox.min.y, -center.z), raw units
    },
    "position": [x, 0, z], "rotationY": 0.785,   // tile space: 8 units = one room tile
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
(base meters, also the in-world inspector default), `--unpinned`,
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
"Slot editing" toggle on, builders/admins hold E at a work, nudge with
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
yaw→quaternion, `pinned: true`). The generated app script does
`app.get('Slot_001')`, hides it, parents an `image`/`video` node with the
artwork's ratio and overrides, plus an optional `ui` placard.

## Host worlds

One Hyperfy container per world (own SQLite + assets + ADMIN_CODE).
`apps/hyperfy/world-template/` is the deployable single-world template
(official `ghcr.io/hyperfy-xyz/hyperfy` image, pinned engine version, full
deploy/backup guide); `apps/hyperfy/docker-compose.worlds.yml` hosts many —
isolate each curator's world, point subdomains at the ports.

## Teach your agent Hyperfy

`apps/hyperfy/harvest-hyperfy-docs.mjs` ingests the official Hyperfy docs
into the MOCA Library — then `/v1/library/ask` (scoped to the Hyperfy
collection) answers scripting/world questions with citations. Hyperfy's own
docs: https://docs.hyperfy.xyz
