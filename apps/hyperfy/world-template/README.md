# The MOCA world template

Deploy your own **Museum of Crypto Art** Hyperfy world: a self-hosted,
multiplayer 3D space that receives exhibitions straight from the museum's
world builder. Anyone can run one — a curator, a collective, a school — and
every world stays fully sovereign: your server, your database, your admin key.

```
museum world builder ──(world URL + admin key)──▶ your Hyperfy world
   curate rooms + artworks                          walkable, multiplayer,
   at museumofcryptoart.com/rooms/world             refinable in-engine
```

## Deploy

Requirements: Docker + a domain (TLS via your proxy — Coolify, Traefik,
Caddy, nginx all work; WebSockets must be forwarded, which they do by default).

```bash
cp .env.example .env
# 1. set ADMIN_CODE   — the world's API key, treat it like a password
# 2. set JWT_SECRET   — openssl rand -hex 32
# 3. set PUBLIC_WS_URL / PUBLIC_API_URL / ASSETS_BASE_URL to your domain
mkdir -p world && sudo chown -R 1001 world   # the engine image runs as uid 1001
docker compose up -d
```

Point your domain at port `3400` (or `HOST_PORT`) and open it in a browser —
you're standing in your world. Verify the server with
`curl https://your-world.example.com/health`.

**Local trial run** (no domain): set the `PUBLIC_*` URLs to
`ws://localhost:3400/ws`, `http://localhost:3400/api`,
`http://localhost:3400/assets` and open `http://localhost:3400`.

## Receive an exhibition

Hand whoever curates two things: the **world URL** and the **admin key**
(`ADMIN_CODE`). They then either:

- use **Spawn to Hyperfy** in the museum world builder
  ([museumofcryptoart.com/rooms/world](https://museumofcryptoart.com/rooms/world)
  → Exhibits tab) — paste URL + key, click Spawn, done; or
- run the CLI from this repo:

  ```bash
  cd apps/hyperfy && npm install
  node spawn-exhibition.mjs my-show.moca-exhibition.json \
    --url https://your-world.example.com --key YOUR_ADMIN_CODE
  ```

Each curated room arrives as **its own app**, pinned in place, with the
artworks attached to it. Spawning is **idempotent**: pushing the same
exhibition again updates the existing rooms in place — curation changes flow
in, while the way you've arranged the rooms in-world is preserved.

## Refine in-engine

Anyone with the admin key can shape the world from inside it. In the world
chat, type `/admin <your code>`, then:

| Do this | To |
| --- | --- |
| **Tab** | toggle build mode |
| **Right-click a room** | open its inspector — the **App pane** has the curation controls: artwork scale, wall gap, placards on/off, art lighting, video volume, slot editing. Changes apply live for everyone. |
| **P** on a room | unpin it, then **grab / 1–4** to move, rotate or scale it — the artworks travel with the room, always |
| **Slot editing** toggle + hold **E** at a work | edit the piece in place: arrows nudge (Shift = faster), scroll resizes, R resets, Enter finishes. Synced live, saved in the world — survives restarts and curation updates. |
| **R** | duplicate · **X** delete |
| Right-click → **Download** | export a room as a portable `.hyp` file |

Museum curation, the room inspector and slot editing compose — pushing a
curation update from the museum builder never wipes what you refined
in-world.

## Operate

- **Backup**: the `./world` folder is the entire world (SQLite DB + assets).
  Stop-copy-start, or snapshot it live.
- **Upgrade**: bump the image tag in `docker-compose.yml`. The MOCA spawner
  is protocol-tested against `v0.16.0`; check `apps/hyperfy/README.md` before
  jumping major engine versions.
- **Many worlds**: run one compose stack per world (separate folders, ports,
  admin keys) — or see `../docker-compose.worlds.yml` for a multi-world file.
- **Voice chat / AI builders**: the engine supports LiveKit and in-world AI
  app generation via extra env vars — see the
  [Hyperfy repo](https://github.com/hyperfy-xyz/hyperfy) `.env.example`.

## Links

- Full pipeline docs: https://docs.museumofcryptoart.com/hyperfy
- World builder: https://museumofcryptoart.com/rooms/world
- Engine: https://github.com/hyperfy-xyz/hyperfy (GPL-3.0)
