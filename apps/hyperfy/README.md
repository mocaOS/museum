# MOCA × Hyperfy

Walk into your own exhibitions. This package connects the museum's world
builder to [Hyperfy](https://github.com/hyperfy-xyz/hyperfy) — the open-source,
self-hostable virtual world engine — so curations made at
`museumofcryptoart.com/exhibitions/world` become real, multiplayer, walkable
3D spaces.

**Privacy by design:** curation data lives in the curator's browser
(localStorage). The exported `*.moca-exhibition.json` file is a download to
their device. Nothing reaches a Hyperfy world until the curator explicitly
runs the spawner — *that* is the "upload it into Hyperfy" moment, and it's
theirs to take.

## The pipeline

```
world builder (browser, localStorage)
   └─ Export → my-show.moca-exhibition.json   (stays on device)
        └─ spawn-exhibition.mjs → Hyperfy world (rooms + artworks, walkable)
```

The exhibition format carries everything: room GLB URLs, placements
(position/rotation), and per-slot artworks with CORS-enabled texture URLs,
true aspect ratios, video URLs for motion works, and the curator's
move/resize overrides. The spawner uploads each room model, generates a
per-room Hyperfy app script that finds the same `Slot_NNN` placeholder nodes
the museum uses, and hangs the art — images as unlit planes, videos as live
spatial video textures.

## One-time setup

```bash
git clone https://github.com/hyperfy-xyz/hyperfy
cd hyperfy
npm install
npm run node-client:build     # builds the headless client the spawner drives
```

Run a world (dev): `npm run dev` → http://localhost:3000. Set `ADMIN_CODE` in
its `.env` unless you want every visitor to be a builder.

## Spawn an exhibition

```bash
node spawn-exhibition.mjs my-show.moca-exhibition.json \
  --hyperfy ../hyperfy \
  --url http://localhost:3000 \
  --admin-code YOUR_CODE
```

Options: `--unit-scale` (museum-tile → meter multiplier for room spacing),
`--art-size` (base artwork size in meters, default 2), `--name` (bot name).

Rooms spawn **pinned** so visitors can't drag them; admins can unpin and
rearrange in-world with Hyperfy's build mode.

## Host many worlds

`docker-compose.worlds.yml` is a template for hosting one world per
exhibition/curator — each fully isolated (own SQLite db, assets, admin code)
behind your proxy. Copy a service block per world, point subdomains at the
ports, hand each curator their admin code.

## Teach the agents Hyperfy

```bash
node harvest-hyperfy-docs.mjs --hyperfy ../hyperfy \
  --cortex https://library.moca.qwellco.de --key cortex_rw_…
```

Ingests the official Hyperfy docs (the repo's `docs/` is the source of
docs.hyperfy.xyz) into a Cortex collection. After that, the MOCA Library —
including the chat widget on docs.museumofcryptoart.com and every
`/v1/library/ask` consumer — answers Hyperfy questions with citations, and
agents can help curators script their worlds.

## Related

- Museum world builder: `apps/museum` → `/exhibitions/world` (the Export button)
- MOCA API: `GET /v1/rooms` (the GLB catalog), `GET /v1/artworks` (media)
- Docs: https://docs.museumofcryptoart.com (Hyperfy guide + API reference)
