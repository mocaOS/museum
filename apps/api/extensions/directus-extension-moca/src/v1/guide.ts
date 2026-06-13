/**
 * The museum guide — exhibition context + visitor Q&A for in-world agents.
 *
 * When a curator spawns an exhibition into a Hyperfy world with a guide, the
 * spawner registers the exhibition here (rooms + curated works, by id). This
 * module enriches that skeleton from the museum's own data — room architect /
 * description / series from `rooms`, artwork artist / description from `nfts`
 * — into a compact CONTEXT DOCUMENT the guide reasons over, then answers
 * visitor questions by combining that context with the Library (Cortex RAG)
 * and an optional Art DeCC0 persona (`moltbot` SOUL from the Codex).
 *
 * Routes (public, no API key — the visitor flow must be keyless, the same
 * privacy posture as /v1/presence; writes are rate-limited and size-clamped):
 * - POST /v1/guide/exhibitions                  register/refresh a context
 * - GET  /v1/guide/exhibitions/:id              the enriched context document
 * - GET  /v1/guide/exhibitions/:id/suggestions  visitor question starters
 * - POST /v1/guide/ask                          answer a visitor question
 *
 * Contexts persist in the `guide_exhibitions` collection (ships as
 * directus-sync snapshot files). Instances that predate the collection fall
 * back to an in-memory store — guides keep working, registrations just don't
 * survive a restart.
 */

import type { CortexAskBody } from "./cortex";

const CONTEXT_CACHE_TTL_MS = 60_000;
const PERSONA_TTL_MS = 60 * 60_000;
const MAX_PLACEMENTS = 60;
const MAX_ARTWORKS_PER_ROOM = 80;
const MAX_HISTORY = 8;
const ROOM_DESC_MAX = 600;
const ART_DESC_MAX = 400;
const PERSONA_SOUL_MAX = 4000;
const SUGGESTION_COUNT = 3;

const REGISTER_PER_MIN = 6;
const ASK_PER_MIN = 20;

// ---------------------------------------------------------------- types ----

interface RegisterArtwork {
  slotId?: string;
  id?: number | null;
  name?: string | null;
  artist?: string | null;
}

interface RegisterPlacement {
  uid?: string;
  room?: { id?: number; title?: string };
  artworks?: RegisterArtwork[];
}

export interface GuideContextArtwork {
  id: number | null;
  title: string | null;
  artist: string | null;
  description: string | null;
  collection: string | null;
}

export interface GuideContextRoom {
  uid: string;
  id: number | null;
  title: string | null;
  architect: string | null;
  description: string | null;
  series: string | null;
  artworks: GuideContextArtwork[];
}

export interface GuideContext {
  id: string;
  name: string;
  registeredAt: string;
  generator: string | null;
  rooms: GuideContextRoom[];
  artists: string[];
  architects: string[];
  counts: { rooms: number; artworks: number; artists: number };
  /** Cortex-suggested visitor questions (filled in asynchronously after
   * registration; template suggestions cover the gap until then). */
  starters?: string[];
}

// ------------------------------------------------------------- helpers ----

const clampText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Stable identity for an exhibition — same charset the builder persists. */
const sanitizeId = (raw: unknown): string | null => {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 64) return null;
  return /^[\w.:-]+$/.test(s) ? s : null;
};

/** Tiny deterministic hash for suggestion rotation. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Per-IP sliding window, same approach as presence pings. */
function createIpLimiter(maxPerMin: number) {
  const windows = new Map<string, number[]>();
  return (req: any): boolean => {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "?")
      .split(",")[0]
      .trim();
    const now = Date.now();
    const hits = (windows.get(ip) || []).filter((t) => now - t < 60_000);
    if (hits.length >= maxPerMin) return false;
    hits.push(now);
    windows.set(ip, hits);
    if (windows.size > 5000) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
    return true;
  };
}

// ------------------------------------------------------- suggestions ----

/**
 * Deterministic visitor question starters from the context itself — instant,
 * offline-safe (they also get baked into the in-world guide app as the
 * fallback for when this API is unreachable). `seed` rotates the picks so
 * consecutive answers offer fresh questions.
 */
export function buildSuggestions(
  ctx: GuideContext,
  seed: number,
  count = SUGGESTION_COUNT,
  /** Lead the picks with the exhibited artworks (used for the baked/greeting
   * set so a first-time visitor is invited straight into the works on show). */
  leadArtworks = false,
): string[] {
  const artworks = ctx.rooms.flatMap((r) => r.artworks).filter((a) => a.title);
  const rooms = ctx.rooms.filter((r) => r.title);
  const artworkQs = artworks.map((a) =>
    a.artist ? `Tell me about “${a.title}” by ${a.artist}.` : `Tell me about the work “${a.title}”.`,
  );

  const pool: string[] = [...(ctx.starters ?? []), ...artworkQs];
  for (const artist of ctx.artists) pool.push(`Who is ${artist}?`);
  for (const r of rooms) {
    pool.push(
      r.architect
        ? `Who designed the room “${r.title}”?`
        : `What can you tell me about the room “${r.title}”?`
    );
  }
  for (const architect of ctx.architects) {
    pool.push(`Tell me about the architect ${architect}.`);
  }
  pool.push(
    `What ties the works in “${ctx.name}” together?`,
    `Where should I start exploring “${ctx.name}”?`,
    `What is the Museum of Crypto Art?`,
    `What is cryptoart, and why does it matter?`
  );

  if (!pool.length) return [];
  const picks: string[] = [];
  const add = (q: string) => {
    if (q && !picks.includes(q) && picks.length < count) picks.push(q);
  };

  // Baked/greeting set: lead with the works on show (seed-rotated for variety
  // across a large catalog), then fill from the rest of the pool.
  if (leadArtworks && artworkQs.length) {
    let a = seed % artworkQs.length;
    const aStride = 1 + (seed % 5);
    for (let n = 0; n < artworkQs.length && picks.length < count; n++) {
      add(artworkQs[a % artworkQs.length]);
      a += aStride;
    }
  }

  let i = seed % pool.length;
  // Stride co-prime-ish with the pool so rotations cover it evenly.
  const stride = 1 + (seed % 7);
  while (picks.length < Math.min(count, pool.length)) {
    add(pool[i % pool.length]);
    i += stride;
  }
  return picks;
}

// ------------------------------------------------------- persona ----

/**
 * The default guide persona is DeCC0 #2875 — Oblak, the Cryptoart Guide &
 * Cultural Bridge (codex.decc0s.com/2875). Its SOUL is loaded from the Codex
 * like any other persona; the hardcoded text below is only the deep fallback
 * for when the Codex itself is unreachable.
 */
const DEFAULT_DECC0 = 2875;
const FALLBACK_PERSONA_NAME = "Oblak";
const FALLBACK_PERSONA = `You are ${FALLBACK_PERSONA_NAME}, the resident guide of the Museum of Crypto Art (MOCA) —
a weathered cryptoart guide and cultural bridge who moves through the liminal spaces between
the traditional and digital art worlds. Your manner is liminal, a little ironic, chill, and
deliberate; you connect works to the artists and ideas behind them, value reinvention, and
believe (as MOCA does) that art is for everyone and memory belongs onchain.`;

interface Persona {
  name: string;
  prompt: string;
}

/** Latest version key of an additively-versioned map ("v0.1", "1.00.00", …). */
function latestVersion(map: Record<string, unknown>): string | null {
  const keys = Object.keys(map).filter((k) => typeof map[k] === "object" && map[k]);
  if (!keys.length) return null;
  return keys.sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  )[keys.length - 1];
}

// ------------------------------------------------------------ module ----

export function registerGuideRoutes(
  router: any,
  deps: {
    itemsService: (collection: string) => Promise<any>;
    cortex: ReturnType<typeof import("./cortex").createCortexClient>;
    decc0s: ReturnType<typeof import("./decc0s").createDecc0sClient>;
    souls: ReturnType<typeof import("./souls").createSoulsClient>;
    venice?: ReturnType<typeof import("./venice").createVeniceClient>;
    publicUrl?: string;
    errorJson: (res: any, status: number, message: string, code: string) => any;
  }
) {
  const { itemsService, cortex, decc0s, souls, venice, publicUrl, errorJson } = deps;

  // Make the most common deployment mistake loud: without CORTEX_API_URL /
  // CORTEX_API_KEY on THIS (Directus) service the guide still answers, but
  // only from the exhibition context — no Library, no knowledge-graph
  // retrieval. In-world that reads as "the guide can't really talk", with no
  // error anywhere. Surface it once at boot so an operator sees it in the logs.
  if (!cortex.configured) {
    console.warn(
      "[moca-guide] CORTEX_API_URL/CORTEX_API_KEY are not set on this Directus deployment — " +
        "the museum guide will answer from exhibition context ONLY (no Cortex Library / knowledge-graph " +
        "retrieval; every /v1/guide/ask response is marked fallback:true). Set both env vars (see " +
        "apps/api/.env.example) and restart to hook the knowledge graph in.",
    );
  }
  // One warn per upstream failure burst, so a flaky/misconfigured Cortex is
  // visible without flooding the logs on every visitor question.
  let lastUpstreamWarn = 0;
  const warnUpstream = (msg: string) => {
    const now = Date.now();
    if (now - lastUpstreamWarn > 30_000) {
      lastUpstreamWarn = now;
      console.warn(`[moca-guide] ${msg}`);
    }
  };

  /**
   * Cortex Q&A is slow (~20s) and occasionally returns a transient 5xx. A
   * single failed call would otherwise drop the guide to an offline,
   * context-only answer — visitors read that as "the guide doesn't really
   * know anything". One retry on a transient failure converts most of those
   * blips back into real knowledge-graph answers; only a genuinely-down
   * Cortex pays the second call before we fall back. 4xx (bad request) is not
   * retried — it won't get better.
   */
  const RETRY_IF_FAILED_WITHIN_MS = 30_000;
  async function askCortexResilient(ask: CortexAskBody): Promise<{ status: number; body: any }> {
    let last: { status: number; body: any } = { status: 0, body: null };
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        last = await cortex.ask(ask);
        if (last.status === 200 && last.body?.answer) return last;
        if (last.status < 500) return last; // 4xx won't improve on retry
      } catch (e: any) {
        last = { status: 0, body: { _error: e?.message } };
      }
      // Only retry a FAST failure (e.g. a quick 500). A slow failure already
      // burned the visitor's patience; retrying would just double the wait
      // for an answer that's unlikely to come — fall straight back instead.
      if (attempt === 0) {
        if (Date.now() - t0 > RETRY_IF_FAILED_WITHIN_MS) break;
        warnUpstream(`Cortex ask transient failure (status ${last.status || "threw"}) — retrying once.`);
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    return last;
  }

  const allowRegister = createIpLimiter(REGISTER_PER_MIN);
  const allowAsk = createIpLimiter(ASK_PER_MIN);

  // ---- text-to-speech (Venice) -----------------------------------------------
  // The guide speaks its answers in-world. We synthesize once per (answer,voice)
  // and serve the bytes at GET /guide/tts/:id.mp3 — the in-world audio node
  // loads that URL. Cached in-memory with a short TTL; no Venice key → silently
  // text-only.
  const TTS_TTL_MS = 10 * 60_000;
  const TTS_MAX_ENTRIES = 80;
  const ttsCache = new Map<string, { at: number; bytes: Buffer; ct: string }>();

  function pruneTts(): void {
    const now = Date.now();
    for (const [k, v] of ttsCache) if (now - v.at > TTS_TTL_MS) ttsCache.delete(k);
    while (ttsCache.size > TTS_MAX_ENTRIES) {
      const oldest = ttsCache.keys().next().value;
      if (oldest === undefined) break;
      ttsCache.delete(oldest);
    }
  }

  /**
   * Synthesize `answer` with the given voice, cache it, and return an absolute
   * audio URL the in-world guide can play — or null when TTS is unavailable.
   */
  async function synthVoice(answer: string, voice: string): Promise<string | null> {
    if (!venice?.configured || !publicUrl) return null;
    const id = hash32(`${voice}:${answer}`).toString(36);
    if (!ttsCache.has(id)) {
      const { status, bytes, contentType } = await venice.synthesize(answer, voice);
      if (status !== 200 || !bytes) {
        warnUpstream(`Venice TTS failed (status ${status}) — answer stays text-only.`);
        return null;
      }
      pruneTts();
      ttsCache.set(id, { at: Date.now(), bytes, ct: contentType || "audio/mpeg" });
    }
    return `${publicUrl}/v1/guide/tts/${id}.mp3`;
  }

  // ---- context store: guide_exhibitions collection + in-memory fallback ----
  const memory = new Map<string, GuideContext>();
  const readCache = new Map<string, { at: number; ctx: GuideContext }>();

  async function saveContext(ctx: GuideContext): Promise<void> {
    memory.set(ctx.id, ctx);
    readCache.set(ctx.id, { at: Date.now(), ctx });
    try {
      const svc = await itemsService("guide_exhibitions");
      const existing = await svc
        .readByQuery({ filter: { id: { _eq: ctx.id } }, fields: ["id"], limit: 1 })
        .catch(() => []);
      if (existing.length) {
        await svc.updateOne(ctx.id, { name: ctx.name, context: ctx });
      } else {
        await svc.createOne({ id: ctx.id, name: ctx.name, context: ctx });
      }
    } catch {
      // Collection not deployed yet (directus-sync push pending) — the
      // in-memory store keeps the guide alive until then.
    }
  }

  async function loadContext(id: string): Promise<GuideContext | null> {
    const cached = readCache.get(id);
    if (cached && Date.now() - cached.at < CONTEXT_CACHE_TTL_MS) return cached.ctx;
    try {
      const svc = await itemsService("guide_exhibitions");
      const rows = await svc.readByQuery({
        filter: { id: { _eq: id } },
        fields: ["id", "context"],
        limit: 1,
      });
      if (rows.length && rows[0].context) {
        const ctx =
          typeof rows[0].context === "string"
            ? (JSON.parse(rows[0].context) as GuideContext)
            : (rows[0].context as GuideContext);
        readCache.set(id, { at: Date.now(), ctx });
        return ctx;
      }
    } catch {
      /* fall through to memory */
    }
    return memory.get(id) ?? null;
  }

  // ---- enrichment from the museum's own data --------------------------------

  async function enrich(body: any): Promise<GuideContext> {
    const placements: RegisterPlacement[] = Array.isArray(body.placements)
      ? body.placements.slice(0, MAX_PLACEMENTS)
      : [];

    const roomIds = [
      ...new Set(
        placements
          .map((p) => Number(p.room?.id))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ];
    const artworkIds = [
      ...new Set(
        placements
          .flatMap((p) => (Array.isArray(p.artworks) ? p.artworks : []))
          .map((a) => Number(a?.id))
          .filter((n) => Number.isInteger(n) && n > 0)
      ),
    ];

    const roomRows = new Map<number, any>();
    if (roomIds.length) {
      try {
        const svc = await itemsService("rooms");
        const rows = await svc.readByQuery({
          filter: { id: { _in: roomIds } },
          fields: ["id", "title", "architect", "description", "series"],
          limit: -1,
        });
        for (const r of rows) roomRows.set(Number(r.id), r);
      } catch {
        /* enrichment is best-effort */
      }
    }

    const nftRows = new Map<number, any>();
    if (artworkIds.length) {
      try {
        const svc = await itemsService("nfts");
        const rows = await svc.readByQuery({
          filter: { id: { _in: artworkIds } },
          fields: ["id", "name", "artist_name", "collection", "response_opensea"],
          limit: -1,
        });
        for (const r of rows) nftRows.set(Number(r.id), r);
      } catch {
        /* enrichment is best-effort */
      }
    }

    const rooms: GuideContextRoom[] = placements.map((p, i) => {
      const dbRoom = roomRows.get(Number(p.room?.id));
      const artworks: GuideContextArtwork[] = (Array.isArray(p.artworks) ? p.artworks : [])
        .slice(0, MAX_ARTWORKS_PER_ROOM)
        .map((a) => {
          const nft = nftRows.get(Number(a?.id));
          return {
            id: nft ? Number(nft.id) : Number.isInteger(Number(a?.id)) && Number(a?.id) > 0 ? Number(a?.id) : null,
            title: clampText(nft?.name ?? a?.name, 160),
            artist: clampText(nft?.artist_name ?? a?.artist, 120),
            description: clampText(nft?.response_opensea?.description, ART_DESC_MAX),
            collection: clampText(nft?.collection, 80),
          };
        })
        .filter((a) => a.title || a.artist);
      return {
        uid: clampText(p.uid, 40) ?? `p${i}`,
        id: dbRoom ? Number(dbRoom.id) : Number(p.room?.id) || null,
        title: clampText(dbRoom?.title ?? p.room?.title, 160),
        architect: clampText(dbRoom?.architect, 120),
        description: clampText(dbRoom?.description, ROOM_DESC_MAX),
        series: clampText(dbRoom?.series, 80),
        artworks,
      };
    });

    const artists = [
      ...new Set(rooms.flatMap((r) => r.artworks.map((a) => a.artist)).filter(Boolean)),
    ] as string[];
    const architects = [
      ...new Set(rooms.map((r) => r.architect).filter(Boolean)),
    ] as string[];

    return {
      id: sanitizeId(body.id)!,
      name: clampText(body.name, 120) ?? "Untitled exhibition",
      registeredAt: new Date().toISOString(),
      generator: clampText(body.generator, 120),
      rooms,
      artists,
      architects,
      counts: {
        rooms: rooms.length,
        artworks: rooms.reduce((n, r) => n + r.artworks.length, 0),
        artists: artists.length,
      },
    };
  }

  // ---- persona (default guide or an Art DeCC0 via the Codex) ----------------

  const personaCache = new Map<number, { at: number; persona: Persona }>();

  async function loadPersona(decc0Id: unknown): Promise<Persona> {
    let id = Number(decc0Id);
    if (!Number.isInteger(id) || id < 1 || id > 10_000) id = DEFAULT_DECC0;
    const hit = personaCache.get(id);
    if (hit && Date.now() - hit.at < PERSONA_TTL_MS) return hit.persona;

    try {
      const result = await decc0s.one(id, true);
      if (result.status === 200 && result.data) {
        const d = result.data;
        const name = (Array.isArray(d.name) ? d.name[0] : d.name) || `DeCC0 #${id}`;
        let prompt = "";
        const molt = d.moltbot && latestVersion(d.moltbot);
        if (molt) {
          const v = d.moltbot[molt];
          const soul = typeof v?.soul === "string" ? v.soul : "";
          const identity = typeof v?.identity === "string" ? v.identity : "";
          prompt = `${identity}\n\n${soul}`.trim().slice(0, PERSONA_SOUL_MAX);
        }
        if (!prompt && d.agent_profiles) {
          const ver = latestVersion(d.agent_profiles);
          const profile = ver ? d.agent_profiles[ver] : null;
          if (profile?.system) prompt = String(profile.system).slice(0, PERSONA_SOUL_MAX);
        }
        if (prompt) {
          const persona = { name, prompt };
          personaCache.set(id, { at: Date.now(), persona });
          return persona;
        }
      }
    } catch {
      /* fall back to the default guide */
    }
    return { name: FALLBACK_PERSONA_NAME, prompt: FALLBACK_PERSONA };
  }

  const soulRefCache = new Map<string, { at: number; persona: Persona }>();

  /** A Soulweaver SOUL by chainId/contract/tokenId — resolved server-side. */
  async function loadSoulRefPersona(ref: any): Promise<Persona | null> {
    const chainId = Number(ref?.chainId);
    const address = String(ref?.address || ref?.contractAddress || "");
    const tokenId = String(ref?.tokenId ?? "");
    if (!Number.isInteger(chainId) || chainId <= 0) return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(address) || !tokenId) return null;
    const key = `${chainId}:${address.toLowerCase()}:${tokenId}`;
    const hit = soulRefCache.get(key);
    if (hit && Date.now() - hit.at < PERSONA_TTL_MS) return hit.persona;
    if (!souls.configured) return null;
    try {
      const { status, body } = await souls.one(chainId, address, tokenId);
      if (status !== 200 || !body) return null;
      // SOUL payload shapes vary slightly across deployments — take the
      // markdown wherever it lives.
      const doc = body.data ?? body;
      const text = [doc.soul, doc.soul_md, doc.content, doc.document, doc.markdown].find(
        (v: unknown) => typeof v === "string" && (v as string).trim()
      ) as string | undefined;
      if (!text) return null;
      const name
        = clampText(doc.name, 60)
          ?? clampText(text.match(/^#\s*(?:SOUL\.md\s*[—-]\s*)?(.+)$/m)?.[1], 60)
          ?? `Soul ${tokenId}`;
      const persona = { name, prompt: text.slice(0, PERSONA_SOUL_MAX) };
      soulRefCache.set(key, { at: Date.now(), persona });
      return persona;
    } catch {
      return null;
    }
  }

  /**
   * Resolve who answers: a custom SOUL (uploaded by the curator, baked into
   * the guide app), a Soulweaver soul by coordinate, an Art DeCC0 by token
   * id — or the default guide (DeCC0 #4209, Tsahafi).
   */
  async function resolvePersona(body: any): Promise<Persona> {
    // NB: not clampText — a SOUL.md needs its line structure intact.
    const customSoul
      = typeof body.soul === "string" && body.soul.trim()
        ? body.soul.trim().slice(0, PERSONA_SOUL_MAX)
        : null;
    if (customSoul) {
      return {
        name:
          clampText(body.soulName, 60)
          ?? clampText(customSoul.match(/^#\s*(?:SOUL\.md\s*[—-]\s*)?(.+)$/m)?.[1], 60)
          ?? "Guide",
        prompt: customSoul,
      };
    }
    if (body.soulRef) {
      const persona = await loadSoulRefPersona(body.soulRef);
      if (persona) return persona;
    }
    return loadPersona(body.decc0);
  }

  // ---- the context block the guide reasons over ------------------------------

  function contextBlock(ctx: GuideContext, persona: Persona): string {
    const lines: string[] = [];
    lines.push(
      `[MUSEUM GUIDE BRIEFING — follow this for the whole conversation]`,
      ``,
      persona.prompt,
      ``,
      `You are currently embodied inside “${ctx.name}”, a walkable 3D exhibition built with the`,
      `Museum of Crypto Art world builder and spawned into a Hyperfy world. A visitor is standing`,
      `in front of you. Answer their questions as ${persona.name}, the exhibition's guide.`,
      ``,
      `EXHIBITION FACTS (authoritative — prefer these over retrieved sources when they conflict):`,
      `Exhibition: “${ctx.name}” — ${ctx.counts.rooms} room(s), ${ctx.counts.artworks} work(s), ${ctx.counts.artists} artist(s).`
    );
    for (const r of ctx.rooms) {
      const head = [
        `Room “${r.title ?? "Untitled"}”`,
        r.architect ? `designed by ${r.architect}` : null,
        r.series ? `series: ${r.series}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      lines.push(``, `• ${head}`);
      if (r.description) lines.push(`  ${r.description}`);
      for (const a of r.artworks) {
        const bits = [
          `“${a.title ?? "Untitled"}”`,
          a.artist ? `by ${a.artist}` : null,
          a.collection ? `(${a.collection})` : null,
        ]
          .filter(Boolean)
          .join(" ");
        lines.push(`  - ${bits}${a.description ? ` — ${a.description}` : ""}`);
      }
    }
    lines.push(
      ``,
      `STYLE: stay in character, be concise (2–4 sentences unless the visitor asks for depth),`,
      `be specific — name works, artists, and rooms. If something isn't in the exhibition facts,`,
      `draw on retrieved museum knowledge; if you still don't know, say so honestly and point`,
      `the visitor to a work or artist you do know. Never invent artworks or attributions.`
    );
    return lines.join("\n");
  }

  /** Offline answer straight from the context — keeps the guide alive without Cortex. */
  function fallbackAnswer(ctx: GuideContext, question: string): string {
    const q = question.toLowerCase();
    for (const r of ctx.rooms) {
      for (const a of r.artworks) {
        if (a.title && q.includes(a.title.toLowerCase())) {
          return [
            `“${a.title}”${a.artist ? ` is by ${a.artist}` : ""}, hanging in “${r.title}”${r.architect ? `, the room designed by ${r.architect}` : ""}.`,
            a.description,
          ]
            .filter(Boolean)
            .join(" ");
        }
      }
      if (r.title && q.includes(r.title.toLowerCase())) {
        const names = r.artworks
          .map((a) => (a.title ? `“${a.title}”${a.artist ? ` by ${a.artist}` : ""}` : null))
          .filter(Boolean)
          .slice(0, 6);
        return [
          `“${r.title}”${r.architect ? ` was designed by ${r.architect}` : ""}${r.series ? ` (${r.series})` : ""}.`,
          r.description,
          names.length ? `It currently shows ${names.join(", ")}.` : null,
        ]
          .filter(Boolean)
          .join(" ");
      }
    }
    for (const artist of ctx.artists) {
      if (q.includes(artist.toLowerCase())) {
        const works = ctx.rooms
          .flatMap((r) => r.artworks)
          .filter((a) => a.artist === artist && a.title)
          .map((a) => `“${a.title}”`)
          .slice(0, 6);
        return `${artist} is one of the ${ctx.counts.artists} artists in “${ctx.name}”${works.length ? `, showing ${works.join(", ")}` : ""}. My deeper knowledge is offline right now — ask me about the works themselves.`;
      }
    }
    return `“${ctx.name}” brings together ${ctx.counts.artworks} works by ${ctx.counts.artists} artists across ${ctx.counts.rooms} room(s). My deeper knowledge is offline right now, but ask me about any work or room you see and I'll tell you what I know.`;
  }

  /**
   * Ask Cortex for visitor question starters — fire-and-forget after a
   * registration so spawns stay fast; until it lands (or when Cortex is
   * down) the deterministic template suggestions cover the gap.
   */
  function enrichStarters(ctx: GuideContext): void {
    if (!cortex.configured) return;
    void (async () => {
      try {
        const persona = { name: FALLBACK_PERSONA_NAME, prompt: FALLBACK_PERSONA };
        const { status, body } = await cortex.ask({
          question:
            "Suggest 8 short, curious questions a first-time visitor might ask you about this exhibition — its works, artists, rooms, architects, or the ideas connecting them. One question per line, no numbering, no commentary.",
          top_k: 5,
          conversation_history: [{ role: "user", content: contextBlock(ctx, persona) }],
        });
        if (status !== 200 || typeof body?.answer !== "string") return;
        const starters = body.answer
          .split("\n")
          .map((l: string) => l.replace(/^[\s\-*•\d.)]+/, "").trim())
          .filter((l: string) => l.length >= 8 && l.length <= 140 && l.includes("?"))
          .slice(0, 8);
        if (starters.length) {
          await saveContext({ ...ctx, starters });
        }
      } catch {
        /* templates keep covering */
      }
    })();
  }

  // ------------------------------------------------------------- routes ----

  router.post("/guide/exhibitions", async (req: any, res: any) => {
    if (!allowRegister(req)) {
      res.set("Retry-After", "60");
      return errorJson(res, 429, "Too many registrations — slow down a little.", "RATE_LIMITED");
    }
    const body = req.body || {};
    if (body.format !== "moca-exhibition@1") {
      return errorJson(res, 400, "Expected a moca-exhibition@1 document", "BAD_REQUEST");
    }
    const id = sanitizeId(body.id);
    if (!id) {
      return errorJson(res, 400, "Missing or invalid exhibition 'id'", "BAD_REQUEST");
    }
    if (!Array.isArray(body.placements) || !body.placements.length) {
      return errorJson(res, 400, "Exhibition has no placements", "BAD_REQUEST");
    }
    try {
      const ctx = await enrich({ ...body, id });
      // Carry forward Cortex starters from a previous registration of the
      // same exhibition; refresh them in the background.
      const previous = await loadContext(id).catch(() => null);
      if (previous?.starters?.length) ctx.starters = previous.starters;
      await saveContext(ctx);
      enrichStarters(ctx);
      res.json({
        data: {
          id: ctx.id,
          name: ctx.name,
          counts: ctx.counts,
          architects: ctx.architects,
          artists: ctx.artists,
          // Baked into the guide app + shown first — lead with the works on show.
          suggestions: buildSuggestions(ctx, hash32(ctx.id), SUGGESTION_COUNT, true),
        },
      });
    } catch (e: any) {
      errorJson(res, 500, e?.message || "Internal error", "INTERNAL");
    }
  });

  router.get("/guide/exhibitions/:id", async (req: any, res: any) => {
    const id = sanitizeId(req.params.id);
    if (!id) return errorJson(res, 400, "Invalid exhibition id", "BAD_REQUEST");
    const ctx = await loadContext(id);
    if (!ctx) {
      return errorJson(res, 404, "Exhibition not registered — spawn it with a guide first.", "NOT_FOUND");
    }
    res.json({ data: ctx });
  });

  router.get("/guide/exhibitions/:id/suggestions", async (req: any, res: any) => {
    const id = sanitizeId(req.params.id);
    if (!id) return errorJson(res, 400, "Invalid exhibition id", "BAD_REQUEST");
    const ctx = await loadContext(id);
    if (!ctx) {
      return errorJson(res, 404, "Exhibition not registered — spawn it with a guide first.", "NOT_FOUND");
    }
    const seed = Number.parseInt(String(req.query.seed ?? ""), 10);
    res.json({
      data: {
        exhibition: ctx.id,
        suggestions: buildSuggestions(ctx, Number.isNaN(seed) ? hash32(ctx.id) : seed),
      },
    });
  });

  router.post("/guide/ask", async (req: any, res: any) => {
    if (!allowAsk(req)) {
      res.set("Retry-After", "60");
      return errorJson(res, 429, "The guide needs a breather — try again in a minute.", "RATE_LIMITED");
    }
    const body = req.body || {};
    const id = sanitizeId(body.exhibition);
    const question = clampText(body.question, 2000);
    if (!id) return errorJson(res, 400, "Missing or invalid 'exhibition' id", "BAD_REQUEST");
    if (!question) return errorJson(res, 400, "Missing 'question'", "BAD_REQUEST");

    const ctx = await loadContext(id);
    if (!ctx) {
      return errorJson(res, 404, "Exhibition not registered — spawn it with a guide first.", "NOT_FOUND");
    }

    try {
      const persona = await resolvePersona(body);
      const seed = hash32(`${id}:${question}`);
      const suggestions = buildSuggestions(ctx, seed);

      if (!cortex.configured) {
        return res.json({
          data: {
            answer: fallbackAnswer(ctx, question),
            persona: persona.name,
            suggestions,
            fallback: true,
          },
        });
      }

      const history = Array.isArray(body.history)
        ? body.history
            .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
            .slice(-MAX_HISTORY)
        : [];

      const ask: CortexAskBody = {
        question,
        top_k: 5,
        // The guide is a knowledge-graph experience: ask Cortex to blend graph
        // traversal into retrieval explicitly, not just rely on the upstream
        // default (so it can't silently change out from under the guide).
        use_graph: true,
        conversation_history: [
          { role: "user", content: contextBlock(ctx, persona) },
          { role: "assistant", content: `Understood — I am ${persona.name}, guiding visitors through “${ctx.name}”.` },
          ...history,
        ],
      };
      const { status, body: upstream } = await askCortexResilient(ask);
      if (status !== 200 || !upstream?.answer) {
        warnUpstream(
          `Cortex ask returned ${status}${upstream?.answer ? "" : " with no answer"} (after retry) — ` +
            "answering “" + ctx.name + "” from exhibition context only.",
        );
        return res.json({
          data: {
            answer: fallbackAnswer(ctx, question),
            persona: persona.name,
            suggestions,
            fallback: true,
          },
        });
      }

      const sources = Array.isArray(upstream.sources)
        ? [
            ...new Set(
              upstream.sources
                .map((s: any) => s?.metadata?.document_title || s?.document_title)
                .filter((t: unknown) => typeof t === "string" && t)
            ),
          ].slice(0, 3)
        : [];

      // Inline [src_N] markers are Library-UI furniture — in a conversation
      // panel they're noise; the sources list rides along separately.
      const answer = String(upstream.answer)
        .replace(/\s*\[src_[^\]]*\]/g, "")
        .trim();

      // Speak it (unless the caller opted out) — synth once, hand back a URL the
      // in-world guide's audio node plays. Best-effort: never blocks the answer.
      const speak = body.speak !== false;
      const voice = clampText(body.voice, 40) || venice?.defaultVoice || "";
      const audioUrl = speak ? await synthVoice(answer, voice).catch(() => null) : null;

      res.json({
        data: {
          answer,
          persona: persona.name,
          suggestions,
          sources,
          ...(audioUrl ? { audioUrl } : {}),
        },
      });
    } catch (e: any) {
      // A Cortex network error or timeout shouldn't take the guide dark —
      // it still has the authoritative exhibition context. Keep it talking,
      // flag the answer as a fallback, and surface the failure in the logs.
      warnUpstream(`guide ask threw (${e?.message || "unknown"}) — answering “${ctx.name}” from exhibition context only.`);
      res.json({
        data: {
          answer: fallbackAnswer(ctx, question),
          persona: FALLBACK_PERSONA_NAME,
          suggestions: buildSuggestions(ctx, hash32(`${id}:${question}`)),
          fallback: true,
        },
      });
    }
  });

  // Serve a synthesized answer's audio (public, keyless like the rest of the
  // guide). The id is minted by /guide/ask; bytes live in the short-TTL cache.
  router.get("/guide/tts/:file", (req: any, res: any) => {
    const id = String(req.params.file || "").replace(/\.mp3$/i, "").replace(/[^\w]/g, "").slice(0, 16);
    const hit = id && ttsCache.get(id);
    if (!hit) {
      return errorJson(res, 404, "Audio expired or not found — ask the guide again.", "NOT_FOUND");
    }
    res.set("Content-Type", hit.ct || "audio/mpeg");
    res.set("Cache-Control", "public, max-age=300");
    res.send(hit.bytes);
  });
}
