---
name: museum-guide
description: Act as a Museum of Crypto Art exhibition guide. Fetch a spawned exhibition's context (rooms, architects, artists, artworks), suggest visitor questions, answer questions about the exhibition through the MOCA guide API, and adopt Art DeCC0 personas. Use when a user asks about a MOCA exhibition, a walkable Hyperfy world spawned from the museum's world builder, or wants museum-guide behavior.
license: MIT
metadata:
  author: museum-of-crypto-art
  version: "1.0"
---

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
    "visitor": "rene",
    "roomUid": "p3",
    "focus": { "artworkId": 812, "title": "Genesis", "artist": "XCOPY" }
  }'
```

→ `{ "data": { answer, persona, suggestions, mode, consulting?, sources?, audioUrl?, audioUrls?, fallback? } }`

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
e.g. `Serena`) request spoken audio. **Spatial awareness:** pass `roomUid` (the
room the visitor is in) and/or `focus` (`{ artworkId?, slotId?, title?, artist? }`
— the work they're standing in front of) so the guide grounds answers in the
here-and-now ("what's in this room?", "which artwork is this?"). `roomUid` is
authoritative; as a fallback you may pass `visitorPos: { x, z }` (world meters)
and the API maps it to a room. **Voice:** when TTS is configured the response
carries **`audioUrls`** — the whole answer split into short, sentence-aligned
mp3 chunks (served from `GET /v1/guide/tts/:id.mp3`) to play back-to-back so the
voice covers the full message; `audioUrl` (the first chunk) is kept for simple
clients. **Library routing:** macro/historical/market questions, artist
deep-dives, and persona questions about people not in the exhibition return a
brief in-character ack with **`consulting: true`** — the real, Cortex-sourced
answer arrives moments later from `GET /v1/guide/followup?exhibition&session`
(which also carries `audioUrls`); show a "consulting the library" state until
then. Plus **who answers** — first match wins:

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
