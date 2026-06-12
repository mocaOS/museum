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

Visitors curate at `museumofcryptoart.com/exhibitions/world` (data stays in
their browser). Export produces `*.moca-exhibition.json`:

```json
{
  "format": "moca-exhibition@1",
  "placements": [{
    "room": { "id", "title", "modelUrl" },
    "position": [x, 0, z], "rotationY": 0.785,
    "artworks": [{
      "slotId": "Slot_001", "ratio": 0.72,
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

Tooling lives in the museum monorepo under `apps/hyperfy`
(github: museumofcryptoart). One-time: clone hyperfy-xyz/hyperfy,
`npm install && npm run node-client:build`. Then:

```bash
node spawn-exhibition.mjs my-show.moca-exhibition.json \
  --hyperfy ../hyperfy --url https://world.example.com --admin-code CODE
```

Under the hood (if you reimplement): upload assets via
`POST {world}/api/upload` (filename = sha256 hex + ext, check
`/api/upload-check?filename=` first), then over the world websocket send
`blueprintAdded` (model + generated script) and `entityAdded` (position,
yaw→quaternion, `pinned: true`). Builder rank required — `ADMIN_CODE` via the
`command` packet `{args:["admin", CODE]}`. The generated app script does
`app.get('Slot_001')`, hides it, parents an `image`/`video` node with the
artwork's ratio and overrides.

## Host many worlds

One Hyperfy server per world (own SQLite + assets + ADMIN_CODE).
`apps/hyperfy/docker-compose.worlds.yml` is the multi-world template —
isolate each curator's world, point subdomains at the ports.

## Teach your agent Hyperfy

`apps/hyperfy/harvest-hyperfy-docs.mjs` ingests the official Hyperfy docs
into the MOCA Library — then `/v1/library/ask` (scoped to the Hyperfy
collection) answers scripting/world questions with citations. Hyperfy's own
docs: https://docs.hyperfy.xyz
