# CLAUDE.md

## Project Overview

MOCA Library — a Next.js 16 app serving the Museum of Crypto Art galleries plus a
**public, anonymous** chat front-end for the Cortex RAG knowledge assistant
(upstream codename: `library-backend`).

This app was forked from `cortex-chat`, a multi-tenant suite. The multi-user layer
(accounts, superadmin, user groups, minted per-group/per-user keys, encrypted key
storage, admin console, document upload, server-side history) has been **stripped
out** — the Library is now a single-key, anonymous experience. If you see references
to auth/users/groups/admin anywhere, they are stale; there is no database.

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

`/exhibitions` lists the museum's 3D rooms (Directus `rooms` collection, GLB models)
with a per-room viewer; `/exhibitions/world` is the **world builder** — an RTS-style
mode where visitors place rooms onto a shared ground plane, hang artworks from the
collection on wall slots, adjust each piece, and save named exhibits. All client-side,
no accounts. Code lives in `src/components/museum/three/`:

- **`WorldBuilder.tsx`** — the builder scene: goal-damped RTS camera (WASD/edge pan,
  Q/E rotate, wheel **zoom-to-cursor**, RMB orbit, MMB pan, double-click room to
  focus), room placement/dragging/rotation, curate mode, exhibits UI, keyboard map.
- **`ArtworkPlane.tsx`** — one hung work: textured plane + matte frame, sized to the
  work's true aspect ratio (read from the loaded texture's pixels, falling back to
  catalog `ratio`). In curate mode supports drag-to-move along the wall plane and a
  corner-handle resize; both write a per-slot override `{dx, dy, scale}`.
- **`ArtworkPicker.tsx`** — in-canvas search/browse panel (`/api/museum/artworks`,
  `/api/museum/collections`), scoped by collection, click to hang.
- **`ExhibitsPanel.tsx`** — save/load/update/delete named exhibits.
- **`slots.ts`** — slot extraction from room GLBs. Authoring convention: every room
  model carries `Slot_001…Slot_NNN` placeholder quads (material "Slot Placeholder");
  their transforms/bboxes define hang position, orientation, and frame size.
- **`world-storage.ts`** — localStorage persistence. Working layout under
  `moca-world-layout-v1` (payload is **v2**: placements + assignments + slot
  overrides; v1 payloads migrate on load). Named exhibits under
  `moca-world-exhibits-v1`. Same localStorage-only convention as chat history.
- **`RoomStage.tsx` / `RoomDetail.tsx`** — the ultra-HQ single-room viewer behind
  `/exhibitions/rooms/[id]` (replaced the old `Room3DViewer` lightbox): auto-framing
  + cinematic dolly-in, emissive/neon handling, radius-scaled key-light shadows,
  blurred MeshReflectorMaterial floor + baked ContactShadows, MSAA HalfFloat
  composer (UnrealBloom threshold 1.0 + vignette), PerformanceMonitor-driven
  adaptive DPR, poster/progress veil, ←/→ keyboard walk with wrap-around and
  idle-time GLB preload of the neighbouring rooms.
- **`RoomsBrowser.tsx`** — the searchable rooms grid on `/exhibitions`
  (client-side search over title/architect/series + series filter chips); each
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
