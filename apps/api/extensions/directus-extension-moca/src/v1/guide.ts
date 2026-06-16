/**
 * The museum guide — exhibition context + visitor Q&A for in-world agents.
 *
 * When a curator spawns an exhibition into a Hyperfy world with a guide, the
 * spawner registers the exhibition here (rooms + curated works, by id). This
 * module enriches that skeleton from the museum's own data — room architect /
 * description / series from `rooms`, artwork artist / description from `nfts`
 * — into a compact CONTEXT DOCUMENT the guide reasons over.
 *
 * HYBRID conversation model (when MUSEUMAGENT_* is configured):
 * - Every reply is a FAST, direct chat completion (the `museumAgent` client →
 *   an OpenAI-compatible model, e.g. Venice) over a context window assembled
 *   fresh per turn: persona + the aggregated MOCA brief (guide-intro) +
 *   authoritative exhibition facts + the rolling SESSION MEMORY + an accumulated
 *   INSIGHTS bucket. This keeps the in-world conversation reactive.
 * - After replying, two things happen ASYNCHRONOUSLY (fire-and-forget, never
 *   blocking the reply): the conversation is summarized into the session memory
 *   (compacted before limits), and Cortex mines the deeper knowledge the visitor
 *   is referring to into the separate insights bucket — which enriches the NEXT
 *   reply. Session memory + insights are ephemeral/in-memory (privacy posture of
 *   /v1/presence), keyed by a per-visitor `session` id.
 * - When MUSEUMAGENT_* is unset the guide keeps its prior Cortex-primary path;
 *   when Cortex is also unset it answers from exhibition context only. Fully
 *   additive — existing deployments behave exactly as before.
 *
 * Routes (public, no API key — the visitor flow must be keyless, the same
 * privacy posture as /v1/presence; writes are rate-limited and size-clamped):
 * - POST /v1/guide/exhibitions                  register/refresh a context
 * - GET  /v1/guide/exhibitions/:id              the enriched context document
 * - GET  /v1/guide/exhibitions/:id/suggestions  visitor question starters
 * - GET  /v1/guide/exhibitions/:id/locate       which room is at a world point
 * - POST /v1/guide/ask                          answer a visitor question
 * - GET  /v1/guide/followup                      a proactive aside once a deeper insight lands
 *
 * Contexts persist in the `guide_exhibitions` collection (ships as
 * directus-sync snapshot files). Instances that predate the collection fall
 * back to an in-memory store — guides keep working, registrations just don't
 * survive a restart.
 */

import type { CortexAskBody } from "./cortex";
import { MOCA_GUIDE_INTRO } from "./guide-intro.generated";
import { createRedisKv, type KvStore } from "./guide-store";
import type { ChatMessage, MuseumAgentClient } from "./museum-agent";

const CONTEXT_CACHE_TTL_MS = 60_000;
const PERSONA_TTL_MS = 60 * 60_000;
const MAX_PLACEMENTS = 60;
const MAX_ARTWORKS_PER_ROOM = 256;
const MAX_HISTORY = 8;
const ROOM_DESC_MAX = 600;
const ART_DESC_MAX = 400;
// The character's voice is everything here, so we give the persona real room —
// the whole SOUL.md plus aggregated DeCC0 Codex personality (context windows
// are large). buildSystemContext still compacts the overall window.
const PERSONA_SOUL_MAX = 12_000;
const PERSONA_CODEX_MAX = 4_000;
// Cap the exhibition-facts listing so persona + facts can't blow the overall
// context window and starve the intro / insights / session-memory blocks.
const EXHIBITION_FACTS_MAX = 50_000;
const SUGGESTION_COUNT = 3;

const REGISTER_PER_MIN = 6;
const ASK_PER_MIN = 20;

// ---- hybrid conversation tuning -------------------------------------------
// Context windows are large; we budget generously and compact before limits.
const SESSION_TTL_MS = 30 * 60_000;
const MAX_SESSIONS = 2000;
const MAX_VERBATIM_TURNS = 8; // recent turns kept verbatim; older fold into the summary
const SESSION_SUMMARY_MAX = 1800; // chars of rolling session memory
const INTRO_BUDGET = 12_000; // chars of the aggregated MOCA brief included in context
const MAX_CONTEXT_CHARS = 256_000; // overall system-context ceiling (~64k tokens)
const MAX_INSIGHTS = 12;
const INSIGHTS_BUDGET = 6_000; // chars of mined insights included in context
const INSIGHT_TEXT_MAX = 1200; // clamp a single Cortex-mined insight
const FAST_REPLY_TIMEOUT_MS = 22_000;
// Keep replies snappy: a tighter token budget returns faster and reads better
// spoken (the persona already asks for 2-4 sentences). The full text still goes
// to the panel; the voice speaks a concise lead.
const FAST_REPLY_MAX_TOKENS = 360;
const SUMMARIZE_TIMEOUT_MS = 15_000;

// ---- shared insight cache + proactive follow-up ---------------------------
// Insights mined for one visitor are cached at the EXHIBITION level so the next
// visitor (and the first answer on a pre-warmed topic) gets depth without re-
// paying for Cortex. Longer-lived than a session; backed by Redis when set.
const SHARED_INSIGHT_TTL_MS = 12 * 60 * 60_000; // 12h
const SHARED_RELOAD_MS = 60_000; // re-pull an exhibition's bucket from Redis at most this often
const SHARED_BUCKET_MAX = 200; // cap topics per exhibition
const PREWARM_MAX_TOPICS = 8; // bounded Cortex load when an exhibition registers
const FOLLOWUP_TTL_MS = 90_000; // a freshly-mined follow-up is offered for this long
const FOLLOWUP_TIMEOUT_MS = 10_000; // compose-the-aside LLM call
// How long a per-visitor session survives in Redis (mirrors the in-memory TTL).
const SESSION_STORE_TTL_MS = SESSION_TTL_MS;

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
  /** Room's world placement (meters): floor-plane center + footprint radius —
   * lets the guide resolve which room a visitor is standing in. */
  location?: { x?: number; z?: number; r?: number };
  artworks?: RegisterArtwork[];
}

export interface GuideContextArtwork {
  id: number | null;
  title: string | null;
  artist: string | null;
  description: string | null;
  collection: string | null;
  /** Best-effort mint/creation date (year or YYYY-MM-DD) from OpenSea traits;
   * null when the source data doesn't carry one. */
  mintedAt: string | null;
}

export interface GuideContextRoom {
  uid: string;
  id: number | null;
  title: string | null;
  architect: string | null;
  description: string | null;
  series: string | null;
  /** World placement (meters): floor-plane center + footprint radius. Lets the
   * guide know which room a visitor stands in (spatial awareness). Null on old
   * registrations that predate location reporting. */
  location: { x: number; z: number; r: number } | null;
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

/** One Cortex-mined nugget about something the visitor referred to. */
interface GuideInsight {
  at: number;
  topic: string;
  text: string;
  sources: string[];
}

/** One spoken chunk: an audio URL, the exact text it speaks, and a generous
 * seconds estimate (watchdog only — the in-world guide detects real chunk-end
 * from the audio node and reveals each chunk's `text` in lockstep with it). */
interface VoiceChunk {
  url: string;
  text: string;
  secs: number;
}

/**
 * Per-visitor conversation state for the hybrid path — ephemeral, in-memory,
 * TTL'd (nothing persisted; same privacy posture as /v1/presence). The two
 * memory buckets the user reasons over: `turns`+`summary` (the conversation
 * itself, compacted) and `insights` (Cortex-mined deeper knowledge).
 */
interface GuideSession {
  key: string;
  at: number;
  turns: { role: "user" | "assistant"; content: string }[];
  summary: string;
  insights: GuideInsight[];
  insightTopics: string[];
  pendingInsight: boolean;
  summarizing: boolean;
  /** The room the visitor was in on the previous turn — lets us notice when
   * they've walked into a NEW room and tell the guide so it stops narrating the
   * room they started in. In-memory only (live spatial state; not persisted). */
  lastRoomUid?: string | null;
  /** A proactive aside the guide composed when a deeper insight landed AFTER
   * the reply — delivered when the in-world guide next polls /guide/followup.
   * `audioChunks` carries the per-chunk text+url+secs the in-world guide reveals
   * in lockstep with the voice; `audioUrls`/`audioUrl` are kept for older guides. */
  pendingFollowup?: { text: string; audioUrl: string | null; audioUrls?: string[]; audioChunks?: VoiceChunk[]; at: number } | null;
  /** When a library-routed question's ack was sent (the moment the visitor
   * starts waiting for the real answer). Bridge fillers fire once the wait
   * crosses ~4s. */
  libAskedAt?: number;
  /** Last time a bridge filler was handed out — paces the second one. */
  lastBridgeAt?: number;
  /** Pre-generated "still researching" one-liners (unique per turn, LLM-minted
   * + pre-warmed TTS) the guide speaks to hold attention while Cortex works.
   * Consumed one per /guide/followup poll once the 4s gap opens. */
  bridges?: { text: string; audioUrls: string[]; audioChunks: VoiceChunk[] }[];
}

/** Normalize a topic/question so trivial rewordings collapse to one key. */
const normTopic = (s: string): string =>
  String(s || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

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

// ------------------------------------------------------- mint date ----

/** Normalize a loose date string to a year ("2021") or ISO day ("2021-03-08").
 * Deliberately avoids the lenient Date.parse (which mis-parses "minted 2019"
 * and timezone-shifts bare months) — we only trust a strict ISO prefix, a unix
 * timestamp, or a plain embedded year. */
function normalizeMintDate(raw: string): string | null {
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}$/.test(s)) return s; // bare year
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ]|$)/.exec(s); // ISO date / timestamp prefix
  if (iso) return iso[1];
  if (/^\d{10,13}$/.test(s)) {
    const ms = s.length >= 13 ? Number(s) : Number(s) * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const y = /\b(?:19|20)\d{2}\b/.exec(s); // a year embedded in "March 2021" etc.
  return y ? y[0] : null;
}

/**
 * Best-effort mint/creation date for an artwork. MOCA's nfts have no mint-date
 * column and the OpenSea blob only carries `updated_at`, so we mine the OpenSea
 * traits (many generative collections expose a "Created"/"Year"/"Date" trait)
 * plus a few date-ish top-level keys some stored blobs include. Null when none.
 */
function extractMintDate(nft: any): string | null {
  const o = nft?.response_opensea;
  if (!o || typeof o !== "object") return null;
  for (const k of ["created_date", "created_at", "mint_date", "minted_at", "creation_date"]) {
    if (typeof o[k] === "string" && o[k].trim()) {
      const d = normalizeMintDate(o[k]);
      if (d) return d;
    }
  }
  if (Array.isArray(o.traits)) {
    for (const tr of o.traits) {
      const ty = String(tr?.trait_type || "").toLowerCase();
      if (/(^|\s)(date|created|mint|year)/.test(ty) && tr?.value != null) {
        const d = normalizeMintDate(String(tr.value));
        if (d) return d;
      }
    }
  }
  return null;
}

// ------------------------------------------------------- spatial ----

/**
 * Which registered room is the visitor standing in? Returns the room whose
 * footprint contains the world point (x,z) — nearest center wins when rooms
 * overlap. Null when the point is inside no room (or no rooms carry location),
 * so we never guess a location we don't have.
 */
function locateRoom(ctx: GuideContext, x: number, z: number): GuideContextRoom | null {
  let inside: GuideContextRoom | null = null;
  let bestD = Infinity;
  for (const r of ctx.rooms) {
    if (!r.location) continue;
    const dx = r.location.x - x;
    const dz = r.location.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d <= r.location.r && d < bestD) {
      bestD = d;
      inside = r;
    }
  }
  return inside;
}

// A visitor standing in a doorway, between rooms, or in a room whose registered
// footprint radius underestimates its true (scaled-up) size won't test as
// "inside" any room — but they clearly mean a room when they ask "what's in
// here?". Fall back to the NEAREST room's center, capped so someone far outside
// the whole exhibition (e.g. at the world spawn) isn't mis-attributed to a room.
const NEAREST_ROOM_MAX_FACTOR = 3;
const NEAREST_ROOM_MAX_MARGIN = 20; // meters

/** The nearest registered room to a world point, within a sane distance cap. */
function nearestRoom(ctx: GuideContext, x: number, z: number): GuideContextRoom | null {
  let best: GuideContextRoom | null = null;
  let bestD = Infinity;
  let bestR = 0;
  for (const r of ctx.rooms) {
    if (!r.location) continue;
    const dx = r.location.x - x;
    const dz = r.location.z - z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < bestD) {
      bestD = d;
      best = r;
      bestR = r.location.r;
    }
  }
  if (!best) return null;
  const cap = Math.max(bestR * NEAREST_ROOM_MAX_FACTOR, bestR + NEAREST_ROOM_MAX_MARGIN);
  return bestD <= cap ? best : null;
}

/**
 * Resolve the room the visitor means by "here" — the one they're inside, else
 * the nearest within the cap. This is what grounds "what's in this room?".
 */
function whereIs(ctx: GuideContext, x: number, z: number): GuideContextRoom | null {
  return locateRoom(ctx, x, z) ?? nearestRoom(ctx, x, z);
}

/** A high-priority context line telling the guide where the visitor is now. */
function locationLine(room: GuideContextRoom | null): string | null {
  if (!room) return null;
  const head = [
    `The visitor is standing with you in the room “${room.title ?? "Untitled"}”`,
    room.architect ? `designed by ${room.architect}` : null,
    room.series ? `(series: ${room.series})` : null,
  ]
    .filter(Boolean)
    .join(" — ");
  // List the room's full curated set (capped) so "what pieces are in this room?"
  // is answerable directly from the metadata, with an exact count.
  const works = room.artworks
    .map((a) => (a.title ? `“${a.title}”${a.artist ? ` by ${a.artist}` : ""}${a.mintedAt ? ` (minted ${a.mintedAt})` : ""}` : null))
    .filter(Boolean) as string[];
  const shown = works.slice(0, 40);
  const more = works.length > shown.length ? ` (+${works.length - shown.length} more)` : "";
  return (
    `[WHERE YOU ARE RIGHT NOW] ${head}. ` +
    (works.length
      ? `This room holds ${works.length} work(s): ${shown.join(", ")}${more}. `
      : "No works are hung in this room yet. ") +
    "When the visitor asks about “this room”, “here”, or what's around them, THIS is the room — " +
    "name it and list its works. Ground your answer here unless they ask about elsewhere."
  );
}

/** The single work the visitor is standing in front of (resolved in-world from
 * their position) — so "which artwork is this?" / "tell me about this piece"
 * answers about the RIGHT work, not a guess from the room's list. */
function focusLine(focus: { title?: string | null; artist?: string | null } | null): string | null {
  if (!focus) return null;
  const title = clampText(focus.title, 160);
  const artist = clampText(focus.artist, 120);
  if (!title && !artist) return null;
  const work = title ? `“${title}”${artist ? ` by ${artist}` : ""}` : `a work by ${artist}`;
  return (
    `[THE WORK RIGHT IN FRONT OF THE VISITOR] They are standing directly in front of ${work}. ` +
    `When they say “this”, “this piece/work/artwork”, “this one”, or ask “which artwork is this?” / ` +
    `“what am I looking at?”, THIS specific work is what they mean — name it and speak about it directly. ` +
    `Only look past it if they clearly ask about something else.`
  );
}

// ------------------------------------------------------- routing ----

// Warm, in-character holding lines while the librarian is consulted (fallback
// when the fast model can't mint one). The real answer follows via /followup.
const LIBRARY_ACKS = [
  "Great question — let me pull that from the deeper records.",
  "Ooh, good one. Give me a moment to dig that up properly.",
  "That deserves a real answer — one second while I look it up.",
  "Let me consult what we hold on that and come right back to you.",
];

/**
 * Deterministic "this needs the Library, not the exhibition facts" detector.
 * The fast model won't reliably defer, and for macro/historical questions or
 * deep-dives on an artist it tends to pad a misleading mini-answer from the
 * works on show. Catch those here and route straight to Cortex (ack now, real
 * answer as a follow-up). Kept tight so genuine exhibition questions still get
 * the instant fast answer.
 */
function needsLibrary(ctx: GuideContext, question: string): boolean {
  const q = ` ${question.toLowerCase()} `;
  // Cryptoart / NFT history, movement, market, scene, era, context.
  if (/(crypto ?art|\bnfts?\b|web3|blockchain)/.test(q) &&
      /(histor|movement|era|scene|happen|context|market|trend|important|matter|began|start|emerg|early|back then|at the time|landscape|culture|world)/.test(q)) return true;
  if (/what (happened|was happening|was going on|was important|were)\b/.test(q)) return true;
  if (/\b(in|around|during|by|before|after) (?:the )?(?:19|20)\d\d\b/.test(q) &&
      /(crypto|nft|art|scene|world|happen|movement|going on|mint)/.test(q)) return true;
  if (/\b(art history|movement|zeitgeist|influenced? by|influence of|compared to|compare it|legacy|significance|how does this relate)\b/.test(q)) return true;
  // Biographical / persona deep-dive: "who is X", "tell me about X", "what is X
  // known for". These belong to the Library whether or not X is on show — a
  // visitor asking about a person/persona NOT in this exhibition must get a
  // brief "let me look that up" and the real, sourced answer as a follow-up,
  // not an invented mini-bio from the fast model. We DON'T route when the
  // visitor is clearly pointing at the here-and-now ("this piece", "this room",
  // "it") — the fast path grounds those in the exhibition facts in front of them.
  const biographical =
    /\b(who (?:is|was|are|were)|tell me (?:more )?about|more about|background on|biograph|known for|famous for|other works?|what else (?:did|has|have)|(?:her|his|their) (?:career|story|life|practice|background))\b/.test(q);
  if (biographical) {
    const deictic = /\b(this|that|these|those|\bit\b|here|the room|the piece|the work|the artwork|the exhibition|the show|you|your)\b/.test(q);
    if (!deictic) return true;
    // Deictic phrasing but it names an exhibition artist outright → still a deep-dive.
    for (const a of ctx.artists) if (a && q.includes(` ${a.toLowerCase()}`)) return true;
  }
  return false;
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
    museumAgent?: MuseumAgentClient;
    publicUrl?: string;
    env?: Record<string, any>;
    errorJson: (res: any, status: number, message: string, code: string) => any;
  }
) {
  const { itemsService, cortex, decc0s, souls, venice, museumAgent, publicUrl, env, errorJson } = deps;

  // Optional durable/shared backend for the ephemeral hybrid state (sessions +
  // shared insights). Null → the guide runs purely in-process, exactly as
  // before. With Redis, state survives a redeploy and is shared across replicas.
  const kv: KvStore | null = createRedisKv(env || {});
  if (kv) {
    console.log(
      "[moca-guide] durable store ON — sessions + mined insights persist via Redis (survive redeploy, shared across replicas).",
    );
  }

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
  // The hybrid fast path is opt-in via MUSEUMAGENT_*. Announce which mode the
  // guide runs in at boot so an operator knows whether replies are fast
  // (direct LLM) or Cortex-primary.
  if (museumAgent?.configured) {
    console.log(
      `[moca-guide] hybrid mode ON — fast replies via MUSEUMAGENT (${museumAgent.model})` +
        (cortex.configured
          ? "; Cortex mines deeper insights asynchronously."
          : "; CORTEX_* unset, so no async insight mining (fast replies only)."),
    );
  } else {
    console.warn(
      "[moca-guide] hybrid mode OFF — MUSEUMAGENT_BASEURL / MUSEUMAGENT_API_KEY / MUSEUMAGENT_MODEL " +
        "are not all set (note the underscore in MUSEUMAGENT_API_KEY). The guide answers on the " +
        "Cortex-primary path (every /v1/guide/ask returns mode:'cortex', not 'fast'). Set all three " +
        "and restart to enable fast hybrid replies.",
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

  // Optional visibility into the Cortex calls the guide makes (mining, starters,
  // pre-warm). Off by default; set GUIDE_DEBUG_CORTEX=true to trace them.
  const debugCortex = String(env?.GUIDE_DEBUG_CORTEX ?? "").toLowerCase() === "true";
  const logCortex = (kind: string, topic: string, status: number, ms: number, sources: string[] = []) => {
    if (!debugCortex) return;
    const src = sources.length ? ` sources=[${sources.slice(0, 3).join(", ")}]` : "";
    console.log(`[moca-guide] cortex ${kind} (${status}, ${ms}ms) "${topic.slice(0, 80)}"${src}`);
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
  // Follow-up is a cheap poll the in-world guide runs for ~30s after an ask
  // (~every 4s), so allow a higher per-IP rate than asks.
  const allowFollowup = createIpLimiter(40);

  // ---- text-to-speech (Venice) -----------------------------------------------
  // The guide speaks its answers in-world. Synthesis is LAZY and decoupled from
  // the text reply: /guide/ask registers the answer text under a content-hash id
  // and returns the audio URL immediately (Venice can take 10-40s — we must NOT
  // block the text reply on it). The in-world audio node then GETs
  // /guide/tts/:id.mp3, which synthesizes on first hit and caches the bytes.
  // No Venice key → no audioUrl, silently text-only.
  const TTS_TTL_MS = 15 * 60_000;
  // Higher than before: each answer now caches several short chunks, not one lead.
  const TTS_MAX_ENTRIES = 240;
  const ttsCache = new Map<string, { at: number; bytes: Buffer; ct: string }>();
  const ttsPending = new Map<string, { at: number; text: string; voice: string }>();
  const ttsInflight = new Map<string, Promise<{ bytes: Buffer; ct: string } | null>>();

  function prune<T extends { at: number }>(map: Map<string, T>): void {
    const now = Date.now();
    for (const [k, v] of map) if (now - v.at > TTS_TTL_MS) map.delete(k);
    while (map.size > TTS_MAX_ENTRIES) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }

  /**
   * Register an answer for speech and return the audio URL the in-world guide
   * plays — WITHOUT synthesizing yet (that happens lazily on the first GET, so
   * the text reply is never blocked on TTS). Null when TTS is unavailable.
   */
  // We speak the WHOLE answer — but split into short, sentence-aligned CHUNKS
  // the in-world guide plays back-to-back. Each chunk synthesizes FAST (~1-2s),
  // so the voice lands immediately AND never cuts off mid-message (the old
  // single ~360-char lead truncated every longer answer). A chunk cap keeps a
  // single Venice request snappy; a chunk-count cap bounds total synth cost.
  const SPOKEN_CHUNK_MAX = 320;
  const MAX_SPOKEN_CHUNKS = 12;
  function spokenChunks(answer: string): string[] {
    const text = String(answer || "").replace(/\s+/g, " ").trim();
    if (!text) return [];
    if (text.length <= SPOKEN_CHUNK_MAX) return [text];
    const sentences = text.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || [text];
    const chunks: string[] = [];
    let cur = "";
    const flush = () => { const s = cur.trim(); if (s) chunks.push(s); cur = ""; };
    for (const raw of sentences) {
      const sentence = raw.trim();
      if (!sentence) continue;
      if (sentence.length > SPOKEN_CHUNK_MAX) {
        // A single over-long sentence: flush, then hard-wrap at word boundaries.
        flush();
        let rest = sentence;
        while (rest.length > SPOKEN_CHUNK_MAX) {
          let cut = rest.lastIndexOf(" ", SPOKEN_CHUNK_MAX);
          if (cut < SPOKEN_CHUNK_MAX * 0.6) cut = SPOKEN_CHUNK_MAX; // no good break — hard cut
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        cur = rest;
        continue;
      }
      if ((cur ? `${cur} ${sentence}` : sentence).length > SPOKEN_CHUNK_MAX) flush();
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
    flush();
    return chunks.slice(0, MAX_SPOKEN_CHUNKS);
  }

  // Generous per-chunk seconds estimate (kokoro speaks ~14-16 chars/s). Used
  // in-world ONLY as a watchdog ceiling (when a chunk's audio never loads) and to
  // pace the text reveal when TTS is off — real chunk-end is detected from the
  // audio node, so an over-estimate here never truncates a clip that IS playing.
  function estimateSpokenSecs(text: string): number {
    const chars = String(text || "").trim().length;
    return Math.min(40, Math.max(1.4, Math.round((chars * 0.07 + 0.9) * 100) / 100));
  }

  /**
   * Register an answer for speech as a SEQUENCE of audio chunks the in-world guide
   * plays back-to-back so the whole message is spoken — returning each chunk's
   * URL, the exact TEXT it speaks, and a watchdog seconds estimate (the guide
   * reveals each chunk's text in lockstep with its audio: a teleprompter). With
   * `prewarm` we kick synthesis of the first couple of chunks IMMEDIATELY
   * (fire-and-forget) so the voice lands ~1-2s after the text; later chunks
   * synthesize lazily on their own GET. Empty when TTS is unavailable. Each URL is
   * absolute when PUBLIC_URL is set, else a path the guide resolves against its
   * own API base.
   */
  function prepareVoice(answer: string, voice: string, prewarm = false): { urls: string[]; chunks: VoiceChunk[] } {
    if (!venice?.configured) return { urls: [], chunks: [] };
    const parts = spokenChunks(answer);
    if (!parts.length) return { urls: [], chunks: [] };
    const chunks: VoiceChunk[] = parts.map((text, i) => {
      const id = hash32(`${voice}:${text}`).toString(36);
      if (!ttsCache.has(id) && !ttsPending.has(id)) {
        prune(ttsPending);
        ttsPending.set(id, { at: Date.now(), text, voice });
      }
      if (prewarm && i < 2) void synthPending(id); // warm the first two; rest on demand
      return { url: `${publicUrl || ""}/v1/guide/tts/${id}.mp3`, text, secs: estimateSpokenSecs(text) };
    });
    return { urls: chunks.map((c) => c.url), chunks };
  }

  /** Synthesize a pending id (deduped across concurrent GETs); cache + return. */
  async function synthPending(id: string): Promise<{ bytes: Buffer; ct: string } | null> {
    const cached = ttsCache.get(id);
    if (cached) return { bytes: cached.bytes, ct: cached.ct };
    const pending = ttsPending.get(id);
    if (!pending || !venice?.configured) return null;
    if (!ttsInflight.has(id)) {
      ttsInflight.set(id, (async () => {
        const { status, bytes, contentType } = await venice!.synthesize(pending.text, pending.voice);
        if (status !== 200 || !bytes) {
          warnUpstream(`Venice TTS failed (status ${status}) — guide stays text-only for this turn.`);
          return null;
        }
        prune(ttsCache);
        const entry = { at: Date.now(), bytes, ct: contentType || "audio/mpeg" };
        ttsCache.set(id, entry);
        ttsPending.delete(id);
        return { bytes: entry.bytes, ct: entry.ct };
      })().finally(() => ttsInflight.delete(id)));
    }
    return ttsInflight.get(id)!;
  }

  // ---- per-visitor conversation store (ephemeral, in-memory, TTL) ----------
  // The hybrid path's two memory buckets live here, keyed by
  // `${exhibitionId}:${session}`. Nothing is persisted — restart clears it (the
  // in-world app re-seeds from the `history` it ships). Same posture as the TTS
  // cache / presence.
  const guideSessions = new Map<string, GuideSession>();

  function pruneSessions(): void {
    const now = Date.now();
    for (const [k, v] of guideSessions) if (now - v.at > SESSION_TTL_MS) guideSessions.delete(k);
    while (guideSessions.size > MAX_SESSIONS) {
      const oldest = guideSessions.keys().next().value;
      if (oldest === undefined) break;
      guideSessions.delete(oldest);
    }
  }

  /** Validate the visitor-supplied session id (opaque, in-world generated). */
  const sanitizeSession = (raw: unknown): string | null => {
    const s = String(raw ?? "").trim();
    return s && /^[\w-]{1,64}$/.test(s) ? s : null;
  };

  /** The durable shape we persist to Redis (transient concurrency flags omitted). */
  type StoredSession = Pick<
    GuideSession,
    "turns" | "summary" | "insights" | "insightTopics" | "pendingFollowup"
  >;

  /** Write a session through to Redis (no-op without Redis or a real key). */
  async function saveSession(s: GuideSession): Promise<void> {
    if (!kv || !s.key) return;
    const stored: StoredSession = {
      turns: s.turns,
      summary: s.summary,
      insights: s.insights,
      insightTopics: s.insightTopics,
      pendingFollowup: s.pendingFollowup ?? null,
    };
    await kv.set(`sess:${s.key}`, stored, SESSION_STORE_TTL_MS);
  }

  /**
   * Get or create a conversation session. The in-process Map is the live
   * working set (unchanged when Redis is off). With Redis, a cold session is
   * rehydrated from the store so memory/insights survive a redeploy and span
   * replicas. When created fresh and the caller shipped recent `history` (the
   * in-world app always does), seed the turns so a first call still has context.
   */
  async function getSession(
    exhibitionId: string,
    sessionId: string,
    seedHistory?: { role: string; content: string }[],
  ): Promise<GuideSession> {
    const key = `${exhibitionId}:${sessionId}`;
    let s = guideSessions.get(key);
    if (s) {
      s.at = Date.now();
      return s;
    }
    pruneSessions();
    if (kv) {
      const stored = await kv.get<StoredSession>(`sess:${key}`);
      if (stored) {
        s = {
          key,
          at: Date.now(),
          turns: Array.isArray(stored.turns) ? stored.turns.slice(-MAX_VERBATIM_TURNS * 2) : [],
          summary: typeof stored.summary === "string" ? stored.summary : "",
          insights: Array.isArray(stored.insights) ? stored.insights : [],
          insightTopics: Array.isArray(stored.insightTopics) ? stored.insightTopics : [],
          pendingInsight: false,
          summarizing: false,
          pendingFollowup: stored.pendingFollowup ?? null,
        };
        guideSessions.set(key, s);
        return s;
      }
    }
    const turns = Array.isArray(seedHistory)
      ? seedHistory
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-MAX_VERBATIM_TURNS)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content.slice(0, 2000) }))
      : [];
    s = { key, at: Date.now(), turns, summary: "", insights: [], insightTopics: [], pendingInsight: false, summarizing: false, pendingFollowup: null };
    guideSessions.set(key, s);
    return s;
  }

  /** Look up an existing session WITHOUT creating one (for the follow-up poll). */
  async function peekSession(exhibitionId: string, sessionId: string): Promise<GuideSession | null> {
    const key = `${exhibitionId}:${sessionId}`;
    const live = guideSessions.get(key);
    if (live) return live;
    if (!kv) return null;
    const stored = await kv.get<StoredSession>(`sess:${key}`);
    if (!stored) return null;
    const s: GuideSession = {
      key,
      at: Date.now(),
      turns: Array.isArray(stored.turns) ? stored.turns.slice(-MAX_VERBATIM_TURNS * 2) : [],
      summary: typeof stored.summary === "string" ? stored.summary : "",
      insights: Array.isArray(stored.insights) ? stored.insights : [],
      insightTopics: Array.isArray(stored.insightTopics) ? stored.insightTopics : [],
      pendingInsight: false,
      summarizing: false,
      pendingFollowup: stored.pendingFollowup ?? null,
    };
    guideSessions.set(key, s);
    return s;
  }

  /** Add a mined insight to a session's bucket (dedup by topic, respect caps). */
  function addSessionInsight(session: GuideSession, ins: GuideInsight): boolean {
    const norm = normTopic(ins.topic);
    if (!norm || session.insightTopics.includes(norm)) return false;
    session.insights.push(ins);
    session.insightTopics.push(norm);
    if (session.insightTopics.length > MAX_INSIGHTS * 2) {
      session.insightTopics.splice(0, session.insightTopics.length - MAX_INSIGHTS * 2);
    }
    while (session.insights.length > MAX_INSIGHTS) session.insights.shift();
    let total = session.insights.reduce((n, i) => n + i.text.length, 0);
    while (session.insights.length > 1 && total > INSIGHTS_BUDGET) {
      const dropped = session.insights.shift()!;
      total -= dropped.text.length;
    }
    return true;
  }

  // ---- exhibition-level shared insight cache --------------------------------
  // Insights mined for any visitor are cached here keyed by exhibition + topic,
  // so the first answer on a known topic is already deep and Cortex isn't re-
  // queried per visitor. Process Map (cross-visitor on one instance) + Redis
  // write-through (cross-instance, survives redeploy) when configured.
  const sharedInsights = new Map<string, Map<string, GuideInsight>>();
  const sharedLoadedAt = new Map<string, number>();

  async function loadSharedBucket(exh: string): Promise<Map<string, GuideInsight>> {
    let bucket = sharedInsights.get(exh);
    const lastLoad = sharedLoadedAt.get(exh) ?? 0;
    const stale = Date.now() - lastLoad > SHARED_RELOAD_MS;
    if (!bucket || (kv && stale)) {
      if (!bucket) {
        bucket = new Map();
        sharedInsights.set(exh, bucket);
      }
      if (kv) {
        const stored = await kv.get<Record<string, GuideInsight>>(`ins:${exh}`);
        if (stored) for (const [k, v] of Object.entries(stored)) bucket.set(k, v);
      }
      sharedLoadedAt.set(exh, Date.now());
    }
    // Drop stale entries.
    const now = Date.now();
    for (const [k, v] of bucket) if (now - v.at > SHARED_INSIGHT_TTL_MS) bucket.delete(k);
    return bucket;
  }

  async function putSharedInsight(exh: string, norm: string, ins: GuideInsight): Promise<void> {
    if (!norm) return;
    const bucket = await loadSharedBucket(exh);
    bucket.set(norm, ins);
    if (bucket.size > SHARED_BUCKET_MAX) {
      const sorted = [...bucket.entries()].sort((a, b) => a[1].at - b[1].at);
      while (bucket.size > SHARED_BUCKET_MAX) {
        const next = sorted.shift();
        if (!next) break;
        bucket.delete(next[0]);
      }
    }
    if (kv) {
      const obj: Record<string, GuideInsight> = {};
      for (const [k, v] of bucket) obj[k] = v;
      void kv.set(`ins:${exh}`, obj, SHARED_INSIGHT_TTL_MS);
    }
  }

  /**
   * Pull any cached insights relevant to this question from the shared bucket —
   * cheap (one Redis GET on a cold exhibition, then in-process). Matches the
   * question topic, named rooms/artworks in the question, and the current room.
   */
  async function gatherSharedInsights(
    ctx: GuideContext,
    question: string,
    here: GuideContextRoom | null,
  ): Promise<GuideInsight[]> {
    const bucket = await loadSharedBucket(ctx.id);
    if (!bucket.size) return [];
    const qn = normTopic(question);
    const out: GuideInsight[] = [];
    const seen = new Set<string>();
    const take = (norm: string) => {
      const ins = bucket.get(norm);
      if (ins && !seen.has(norm)) {
        seen.add(norm);
        out.push(ins);
      }
    };
    take(qn);
    for (const r of ctx.rooms) {
      if (r.title && qn.includes(normTopic(r.title))) take(roomTopicKey(r));
      for (const a of r.artworks) {
        if (a.title && qn.includes(normTopic(a.title))) take(artworkTopicKey(a));
      }
    }
    if (here?.title) take(roomTopicKey(here));
    // Cheap fuzzy: any cached topic whose normalized key is contained in the question.
    for (const [norm, ins] of bucket) {
      if (!seen.has(norm) && norm.length >= 6 && qn.includes(norm)) {
        seen.add(norm);
        out.push(ins);
      }
    }
    return out.slice(0, 4);
  }

  /** Stable shared-cache keys for pre-warmed room/artwork topics. */
  const roomTopicKey = (r: GuideContextRoom): string =>
    normTopic(r.architect ? `Who designed the room ${r.title}?` : `What can you tell me about the room ${r.title}?`);
  const artworkTopicKey = (a: GuideContextArtwork): string =>
    normTopic(a.artist ? `Tell me about ${a.title} by ${a.artist}.` : `Tell me about the work ${a.title}.`);

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
            mintedAt: extractMintDate(nft),
          };
        })
        .filter((a) => a.title || a.artist);
      const loc = p.location;
      const location
        = loc && typeof loc.x === "number" && loc.x === loc.x && typeof loc.z === "number" && loc.z === loc.z
          ? { x: loc.x, z: loc.z, r: typeof loc.r === "number" && loc.r > 0 ? loc.r : 8 }
          : null;
      return {
        uid: clampText(p.uid, 40) ?? `p${i}`,
        id: dbRoom ? Number(dbRoom.id) : Number(p.room?.id) || null,
        title: clampText(dbRoom?.title ?? p.room?.title, 160),
        architect: clampText(dbRoom?.architect, 120),
        description: clampText(dbRoom?.description, ROOM_DESC_MAX),
        series: clampText(dbRoom?.series, 80),
        location,
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

  // ---- persona (default guide or an Art DeCC0 from the Codex) ---------------

  const personaCache = new Map<number, { at: number; persona: Persona }>();

  /** Coerce a Codex field (string | string[] | other) to a clean string. */
  const flatText = (v: unknown): string => {
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
    return typeof v === "string" ? v.trim() : "";
  };

  /**
   * Aggregate the personality the Codex carries BEYOND the SOUL.md — the lore
   * and traits that make a DeCC0 itself (description, lineage, affiliations,
   * artstyle, DNA). The richer the character, the more it has to riff on while
   * keeping the visitor in flow.
   */
  function codexPersonality(d: any): string {
    const lines: string[] = [];
    const desc = flatText(d.description);
    if (desc) lines.push(desc);
    const facts: string[] = [];
    const push = (label: string, v: unknown) => {
      const s = flatText(v);
      if (s) facts.push(`${label}: ${s}`);
    };
    push("Type", d.decc0_type);
    push("Lineage", d.ancestor);
    push("Cultural affiliation", d.cultural_affiliation);
    push("Philosophy", d.philosophical_affiliation);
    push("Art it loves", d.artstyle_loved);
    const dna = [d.dna1, d.dna2, d.dna3, d.dna4].map(flatText).filter(Boolean);
    if (dna.length) facts.push(`Traits: ${dna.join(", ")}`);
    if (facts.length) lines.push(facts.join(". ") + ".");
    return lines.join("\n").slice(0, PERSONA_CODEX_MAX);
  }

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
        // The character's SOUL.md (identity + soul). Upstream the Codex stores
        // its versions in the `moltbot` field; we take the latest.
        let soul = "";
        const soulVer = d.moltbot && latestVersion(d.moltbot);
        if (soulVer) {
          const v = d.moltbot[soulVer];
          const soulBody = typeof v?.soul === "string" ? v.soul : "";
          const identity = typeof v?.identity === "string" ? v.identity : "";
          soul = `${identity}\n\n${soulBody}`.trim();
        }
        if (!soul && d.agent_profiles) {
          const ver = latestVersion(d.agent_profiles);
          const profile = ver ? d.agent_profiles[ver] : null;
          if (profile?.system) soul = String(profile.system);
        }
        // Full SOUL.md + the Codex personality fused into one persona prompt.
        const codex = codexPersonality(d);
        const prompt = [soul.slice(0, PERSONA_SOUL_MAX), codex && `--- Codex (lore & traits) ---\n${codex}`]
          .filter(Boolean)
          .join("\n\n")
          .trim();
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
   * id — or the default guide (DeCC0 #2875, Oblak).
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
      `[WHO YOU ARE — this voice IS the answer; never break it]`,
      ``,
      persona.prompt,
      ``,
      `You are ${persona.name}, embodied as a living avatar inside “${ctx.name}”, a walkable 3D`,
      `exhibition built with the Museum of Crypto Art world builder and spawned into a Hyperfy world.`,
      `A visitor stands in front of you and you speak with them out loud. Everything you say is in`,
      `YOUR voice, taste and vibe — the SOUL above is not a topic, it's how you think and talk.`,
      ``,
      `EXHIBITION FACTS (authoritative — prefer these over anything retrieved when they conflict):`,
      `Exhibition: “${ctx.name}” — ${ctx.counts.rooms} room(s), ${ctx.counts.artworks} work(s), ${ctx.counts.artists} artist(s).`
    );
    // Budget the facts listing: a huge exhibition (up to 60 rooms × 80 works)
    // would otherwise dominate the whole window. Stop cleanly and note the rest.
    let factsLen = 0;
    let roomsShown = 0;
    for (const r of ctx.rooms) {
      const head = [
        `Room “${r.title ?? "Untitled"}”`,
        r.architect ? `designed by ${r.architect}` : null,
        r.series ? `series: ${r.series}` : null,
      ]
        .filter(Boolean)
        .join(" — ");
      const roomLines = [``, `• ${head}`];
      if (r.description) roomLines.push(`  ${r.description}`);
      for (const a of r.artworks) {
        const bits = [
          `“${a.title ?? "Untitled"}”`,
          a.artist ? `by ${a.artist}` : null,
          a.mintedAt ? `minted ${a.mintedAt}` : null,
          a.collection ? `(${a.collection})` : null,
        ]
          .filter(Boolean)
          .join(" ");
        roomLines.push(`  - ${bits}${a.description ? ` — ${a.description}` : ""}`);
      }
      const chunk = roomLines.join("\n");
      if (factsLen + chunk.length > EXHIBITION_FACTS_MAX && roomsShown > 0) {
        const left = ctx.rooms.length - roomsShown;
        if (left > 0) lines.push(``, `(…and ${left} more room(s) — ask about any of them and I'll recall the details.)`);
        break;
      }
      lines.push(...roomLines);
      factsLen += chunk.length + 1;
      roomsShown++;
    }
    lines.push(
      ``,
      `HOW YOU SPEAK:`,
      `- Always in character — concise (2–4 sentences unless they ask for depth), specific (name`,
      `  works, artists, rooms), and in your own taste and vibe.`,
      `- Any "deeper knowledge" you're given is research your runners pulled from the museum's`,
      `  library. RELAY it as your OWN recollection, reworded in your voice — never quote it, never`,
      `  say "sources/notes/the library say". It's simply what you know.`,
      `- KEEP THE VISITOR IN FLOW: always give them something vivid right now and leave a thread`,
      `  they'll want to pull next, so the conversation never stalls while you dig deeper.`,
      `- Give your best reply NOW from what you know here. For anything beyond these works —`,
      `  cryptoart history, movements/eras, an artist's wider career, market context — keep that`,
      `  first reply SHORT and don't pad it with invented movements or art-historical claims;`,
      `  your runners are already pulling the real detail and it lands in a moment as a follow-up.`,
      `- Never invent artworks, attributions, dates, movements, or biographical facts.`
    );
    return lines.join("\n");
  }

  // ---- hybrid fast path: dynamic context + async memory/insight mining -----

  /**
   * Assemble the system context the fast model reasons over, FRESH per reply:
   * persona + exhibition facts (via contextBlock) + the aggregated MOCA brief +
   * the session's accumulated Cortex insights + the rolling session memory.
   * Built newest-relevant-first and clamped so we compact before the model's
   * limit (insights trimmed first, then the brief).
   */
  function buildSystemContext(
    ctx: GuideContext,
    persona: Persona,
    session: GuideSession,
    here: GuideContextRoom | null,
    focus?: { title?: string | null; artist?: string | null } | null,
    movedRooms?: boolean,
  ): string {
    const blocks: string[] = [contextBlock(ctx, persona)];
    let budget = MAX_CONTEXT_CHARS - blocks[0]!.length;

    // Spatial awareness leads — it's the most situationally important signal.
    // When the visitor has just walked into a NEW room, say so loudly so the
    // guide narrates where they ARE now, not the room they started in.
    if (movedRooms && here && budget > 200) {
      const moved = `[THE VISITOR JUST MOVED] They have walked into a different room since your last reply. They are NOW in “${here.title ?? "this room"}”. Talk about where they are NOW — do not keep describing the previous room.`;
      blocks.push(`\n\n${moved}`);
      budget -= moved.length + 4;
    }
    const loc = locationLine(here);
    if (loc) {
      blocks.push(`\n\n${loc}`);
      budget -= loc.length + 4;
    }
    // The specific work they're standing in front of beats the room list for
    // "this piece" / "which artwork is this?".
    const foc = focusLine(focus ?? null);
    if (foc) {
      blocks.push(`\n\n${foc}`);
      budget -= foc.length + 4;
    }

    if (MOCA_GUIDE_INTRO && budget > 2000) {
      const intro = MOCA_GUIDE_INTRO.slice(0, Math.max(0, Math.min(INTRO_BUDGET, budget - 200)));
      blocks.push(`\n\n[HOW MOCA & ITS EXHIBITIONS WORK — background, the exhibition facts above win on conflict]\n${intro}`);
      budget -= intro.length + 120;
    }

    if (session.insights.length && budget > 500) {
      const lines: string[] = [];
      let used = 0;
      // Newest insight first — the freshest thing the visitor asked about.
      // NB: no source labels here — you relay this as your own recollection.
      for (const ins of [...session.insights].reverse()) {
        const line = `• ${ins.topic}: ${ins.text}`;
        if (used + line.length > Math.min(INSIGHTS_BUDGET, budget)) break;
        lines.push(line);
        used += line.length + 1;
      }
      if (lines.length) {
        blocks.push(
          `\n\n[WHAT YOU'VE LEARNED THIS SESSION — your runners pulled this from the museum's library. ` +
            `It's YOUR knowledge now: relay it in your own voice and vibe, never verbatim, never as "sources".]\n` +
            lines.join("\n"),
        );
        budget -= used;
      }
    }

    // Keep the visitor in flow: when a deeper retrieval is still in flight from a
    // prior turn, don't stall — give them something good now and tease what's coming.
    if (session.pendingInsight && budget > 200) {
      blocks.push(
        `\n\n[STILL DIGGING] You've sent runners to pull deeper records on what they just asked — ` +
          `not back yet. Answer richly from what you already know, stay fully in character, and leave ` +
          `a hook so they want to keep talking until the deeper detail lands.`,
      );
    }

    if (session.summary && budget > 200) {
      blocks.push(`\n\n[SESSION MEMORY — what this visitor has been exploring with you so far]\n${session.summary.slice(0, Math.max(0, budget - 60))}`);
    }

    return blocks.join("");
  }

  /** Recent verbatim turns as chat messages (older turns live in the summary). */
  function turnMessages(session: GuideSession): ChatMessage[] {
    return session.turns.slice(-MAX_VERBATIM_TURNS).map((t) => ({ role: t.role, content: t.content }));
  }

  /**
   * Fold the latest exchange into the rolling session memory with the fast model
   * — cheap, async, never blocks the reply. Keeps a good grasp of the whole
   * session while staying compact (compaction before limits).
   */
  async function summarizeSession(session: GuideSession, question: string, answer: string): Promise<void> {
    if (!museumAgent?.configured || session.summarizing) return;
    session.summarizing = true;
    try {
      const { status, text } = await museumAgent.chat({
        timeoutMs: SUMMARIZE_TIMEOUT_MS,
        temperature: 0.2,
        maxTokens: 400,
        messages: [
          {
            role: "system",
            content:
              "You maintain a compact running memory of a museum guide's conversation with one visitor. " +
              `Always answer with the updated memory only — prose, no preamble, under ${SESSION_SUMMARY_MAX} characters.`,
          },
          {
            role: "user",
            content:
              `Current memory:\n${session.summary || "(none yet)"}\n\n` +
              `New exchange:\nVisitor: ${question}\nGuide: ${answer}\n\n` +
              "Return the updated memory: the visitor's interests and intent, the key facts you've shared, " +
              "named works/artists/rooms they care about, and any open threads to follow up on.",
          },
        ],
      });
      if (status === 200 && text) {
        session.summary = text.slice(0, SESSION_SUMMARY_MAX);
        void saveSession(session);
      }
    } catch {
      /* memory update is best-effort */
    } finally {
      session.summarizing = false;
    }
  }

  /**
   * One Cortex DEEP retrieval (graph traversal — affordable now the reply path
   * is fast) about `question`, returned as a normalized insight. Session-free,
   * so both per-visitor mining and registration pre-warm reuse it.
   */
  async function cortexMine(
    ctx: GuideContext,
    persona: Persona,
    question: string,
    here: GuideContextRoom | null,
    summary?: string,
  ): Promise<GuideInsight | null> {
    const topic = question.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!topic || !cortex.configured) return null;
    const loc = locationLine(here);
    const t0 = Date.now();
    const { status, body } = await askCortexResilient({
      question,
      top_k: 8,
      use_graph: true,
      use_agentic: false,
      conversation_history: [
        { role: "user", content: contextBlock(ctx, persona) },
        { role: "assistant", content: `Understood — I am ${persona.name}, guiding visitors through “${ctx.name}”.` },
        // Bias retrieval toward where the visitor is (a soft hint to the RAG
        // LLM, not a hard collection filter).
        ...(loc ? [{ role: "user", content: loc }] : []),
        ...(summary ? [{ role: "user", content: `Conversation so far: ${summary}` }] : []),
      ],
    });
    const srcTitles = Array.isArray(body?.sources)
      ? (body.sources as any[]).map((s) => s?.metadata?.document_title || s?.document_title).filter((t) => typeof t === "string")
      : [];
    logCortex("mine", topic, status, Date.now() - t0, srcTitles);
    if (status !== 200 || typeof body?.answer !== "string" || !body.answer.trim()) return null;
    const text = String(body.answer).replace(/\s*\[src_[^\]]*\]/g, "").replace(/\s+/g, " ").trim().slice(0, INSIGHT_TEXT_MAX);
    if (!text) return null;
    const sources: string[] = [];
    if (Array.isArray(body.sources)) {
      for (const s of body.sources as any[]) {
        const t = s?.metadata?.document_title || s?.document_title;
        if (typeof t === "string" && t && !sources.includes(t)) sources.push(t);
        if (sources.length >= 3) break;
      }
    }
    return { at: Date.now(), topic, text, sources };
  }

  /**
   * After a fast reply, mine the deeper knowledge the visitor referred to and
   * (a) add it to the session bucket, (b) cache it at the exhibition level for
   * everyone, and (c) compose a short in-character ASIDE the guide delivers when
   * the visitor next polls /guide/followup — so a late insight actually reaches
   * them ("smarter each turn"), not just maybe-helps the next question. One in-
   * flight query per session; skips topics already mined or already cached.
   */
  /** A short, in-character "let me look that up" line for library-routed
   * questions — minted by the fast model, with a template fallback. Never tries
   * to answer (the real answer arrives via the follow-up). */
  async function makeAck(persona: Persona, question: string, voice: string, speak: boolean): Promise<{ text: string; audioUrl: string | null; audioUrls: string[]; audioChunks: VoiceChunk[] }> {
    let text = "";
    if (museumAgent?.configured) {
      try {
        const { status, text: t } = await museumAgent.chat({
          timeoutMs: 8000,
          temperature: 0.7,
          maxTokens: 60,
          messages: [
            {
              role: "system",
              content:
                `${persona.prompt}\n\nYou are ${persona.name}. The visitor just asked something that needs ` +
                `deeper research from the museum's records. In ONE short, warm, in-character sentence, tell ` +
                `them you're looking it up right now. Do NOT attempt to answer the question itself.`,
            },
            { role: "user", content: question },
          ],
        });
        if (status === 200 && t) text = t.replace(/\s*\[src_[^\]]*\]/g, "").trim().slice(0, 200);
      } catch {
        /* fall back to a template */
      }
    }
    if (!text) text = LIBRARY_ACKS[hash32(question) % LIBRARY_ACKS.length];
    const { urls, chunks } = speak ? prepareVoice(text, voice, true) : { urls: [], chunks: [] };
    return { text, audioUrl: urls[0] ?? null, audioUrls: urls, audioChunks: chunks };
  }

  /**
   * Mint a couple of UNIQUE, in-character "still researching" one-liners and
   * pre-warm their TTS, stashed on the session. While a library-routed answer is
   * still being mined, /guide/followup hands these out (once the wait crosses
   * ~4s) so the guide bridges the silence — "almost there, the records run deep"
   * — instead of going quiet. Minted by the agent model so they're organic and
   * never repeat verbatim; best-effort (the guide just stays quiet without them).
   */
  async function prepareBridges(
    session: GuideSession,
    persona: Persona,
    question: string,
    voice: string,
    speak: boolean,
  ): Promise<void> {
    if (!museumAgent?.configured) return;
    try {
      const { status, text } = await museumAgent.chat({
        timeoutMs: 7000,
        temperature: 0.95,
        maxTokens: 90,
        messages: [
          {
            role: "system",
            content:
              `${persona.prompt}\n\nYou are ${persona.name}, a museum guide. You've just sent the visitor's ` +
              `question off to the museum library and it's taking a moment to come back. Write TWO DIFFERENT, ` +
              `short, warm, in-character one-liners to keep them company while they wait — e.g. "Almost there — ` +
              `the records run deep on this one." or "Bear with me, just pulling the threads together." Each ` +
              `must be DISTINCT, under 14 words, no numbering, no quotes. Do NOT answer the question itself. ` +
              `One per line.`,
          },
          { role: "user", content: question },
        ],
      });
      if (status !== 200 || !text) return;
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[\s\-*\d.)"']+/, "").replace(/\s*\[src_[^\]]*\]/g, "").trim())
        .filter((l) => l.length > 2)
        .slice(0, 2);
      const bridges = lines.map((line) => {
        const { urls, chunks } = speak ? prepareVoice(line, voice, true) : { urls: [], chunks: [] };
        return { text: line, audioUrls: urls, audioChunks: chunks };
      });
      if (bridges.length) {
        session.bridges = bridges;
        void saveSession(session);
      }
    } catch {
      /* bridges are a nicety — never block on them */
    }
  }

  async function mineInsight(
    ctx: GuideContext,
    session: GuideSession,
    persona: Persona,
    question: string,
    here: GuideContextRoom | null,
    voice: string,
    speak: boolean,
    priorReply: string,
    priorWasAck: boolean,
  ): Promise<void> {
    if (!cortex.configured || session.pendingInsight) return;
    const norm = normTopic(question.slice(0, 120));
    if (!norm) return;
    // Library-routed (ack) turns MUST deliver the answer, even from cache. Normal
    // turns dedup — the immediate reply already folded any cached insight in.
    if (!priorWasAck && session.insightTopics.includes(norm)) return;
    session.pendingInsight = true;
    // Library-routed turns make the visitor wait for the real answer — mint a
    // couple of organic "still researching" bridges in parallel with the mine,
    // so the guide can hold attention if Cortex takes more than a few seconds.
    if (priorWasAck) void prepareBridges(session, persona, question, voice, speak);
    try {
      // Reuse this session's or a pre-warmed / cross-visitor cached insight first.
      let insight: GuideInsight | null = session.insights.find((i) => normTopic(i.topic) === norm) || null;
      if (!insight) {
        const bucket = await loadSharedBucket(ctx.id);
        insight = bucket.get(norm) || null;
        if (insight) addSessionInsight(session, insight);
      }
      if (!insight) {
        insight = await cortexMine(ctx, persona, question, here, session.summary);
        if (insight) {
          addSessionInsight(session, insight);
          await putSharedInsight(ctx.id, norm, insight);
        }
      }
      if (!museumAgent?.configured) return;
      if (insight) {
        await composeFollowup(session, persona, insight, voice, speak, question, priorReply, priorWasAck);
      } else if (priorWasAck) {
        // We promised an answer but Cortex came up empty — don't leave them hanging.
        const miss = "Hm — my deeper records came up short on that one. Ask me about any of the works or artists here and I'll dig right in.";
        const { urls: missAudio, chunks: missChunks } = speak ? prepareVoice(miss, voice, true) : { urls: [], chunks: [] };
        session.pendingFollowup = { text: miss, audioUrl: missAudio[0] ?? null, audioUrls: missAudio, audioChunks: missChunks, at: Date.now() };
      }
    } catch {
      /* insight mining is best-effort */
    } finally {
      session.pendingInsight = false;
      void saveSession(session);
    }
  }

  /**
   * Stash a follow-up (with pre-warmed audio) for the next /guide/followup poll:
   * the deeper, Cortex-backed take on what the visitor just asked. When the prior
   * reply was a real answer, this EXTENDS it (no repetition); when it was just an
   * acknowledgement (library-routed), this IS the answer.
   */
  async function composeFollowup(
    session: GuideSession,
    persona: Persona,
    insight: GuideInsight,
    voice: string,
    speak: boolean,
    question: string,
    priorReply: string,
    priorWasAck: boolean,
  ): Promise<void> {
    if (!museumAgent?.configured) return;
    try {
      const system = priorWasAck
        ? `${persona.prompt}\n\nYou are ${persona.name}, a museum guide. You told the visitor you'd look ` +
          `up their question — here's what you found. Give the real, specific answer in your own voice, ` +
          `2-4 sentences, no preamble. Never mention "the library", "sources", or notes — it's simply what you know.`
        : `${persona.prompt}\n\nYou are ${persona.name}, a museum guide. A moment ago you replied to the ` +
          `visitor (quoted below); your runners have now pulled deeper material. Come back naturally ` +
          `(e.g. "So — building on that…") and CONTINUE your answer with the new substance, 2-4 sentences. ` +
          `Do NOT repeat what you already said. Never mention "the library", "sources", or notes.`;
      const user = priorWasAck
        ? `The visitor asked: "${question}"\n\nWhat you found:\n${insight.text}`
        : `The visitor asked: "${question}"\nYou already told them: "${priorReply.slice(0, 600)}"\n\nThe deeper material you just pulled:\n${insight.text}`;
      const { status, text } = await museumAgent.chat({
        timeoutMs: FOLLOWUP_TIMEOUT_MS,
        temperature: 0.6,
        maxTokens: 420,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const line = status === 200 && text ? text.replace(/\s*\[src_[^\]]*\]/g, "").trim() : "";
      if (!line) return;
      const { urls: audioUrls, chunks: audioChunks } = speak ? prepareVoice(line, voice, true) : { urls: [], chunks: [] };
      session.pendingFollowup = { text: line.slice(0, 900), audioUrl: audioUrls[0] ?? null, audioUrls, audioChunks, at: Date.now() };
    } catch {
      /* the follow-up is best-effort — never block on it */
    }
  }

  /**
   * Fire-and-forget after a registration: mine a few of the exhibition's rooms
   * and works into the SHARED insight cache, so the very first visitor question
   * on those topics is already deep (no cold Cortex wait). Bounded + deduped.
   */
  const prewarming = new Set<string>();
  function prewarmInsights(ctx: GuideContext): void {
    if (!cortex.configured || prewarming.has(ctx.id)) return;
    prewarming.add(ctx.id);
    void (async () => {
      try {
        const persona: Persona = { name: FALLBACK_PERSONA_NAME, prompt: FALLBACK_PERSONA };
        const bucket = await loadSharedBucket(ctx.id);
        // Lead with the works on show, then the rooms — the questions visitors
        // actually open with. Keyed exactly like gatherSharedInsights looks them up.
        const jobs: { key: string; question: string; here: GuideContextRoom | null }[] = [];
        for (const r of ctx.rooms) {
          for (const a of r.artworks) {
            if (!a.title) continue;
            jobs.push({
              key: artworkTopicKey(a),
              question: a.artist ? `Tell me about “${a.title}” by ${a.artist}.` : `Tell me about the work “${a.title}”.`,
              here: r,
            });
          }
        }
        for (const r of ctx.rooms) {
          if (!r.title) continue;
          jobs.push({
            key: roomTopicKey(r),
            question: r.architect ? `Who designed the room “${r.title}”?` : `What can you tell me about the room “${r.title}”?`,
            here: r,
          });
        }
        let mined = 0;
        for (const job of jobs) {
          if (mined >= PREWARM_MAX_TOPICS) break;
          if (bucket.has(job.key)) continue;
          const insight = await cortexMine(ctx, persona, job.question, job.here);
          if (insight) {
            await putSharedInsight(ctx.id, job.key, insight);
            mined++;
          }
        }
        if (mined) console.log(`[moca-guide] pre-warmed ${mined} insight(s) for “${ctx.name}” (${ctx.id}).`);
      } catch {
        /* pre-warm is best-effort */
      } finally {
        prewarming.delete(ctx.id);
      }
    })();
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
        const t0 = Date.now();
        const { status, body } = await cortex.ask({
          question:
            "Suggest 8 short, curious questions a first-time visitor might ask you about this exhibition — its works, artists, rooms, architects, or the ideas connecting them. One question per line, no numbering, no commentary.",
          top_k: 5,
          conversation_history: [{ role: "user", content: contextBlock(ctx, persona) }],
        });
        logCortex("starters", ctx.name, status, Date.now() - t0);
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
      // Pre-warm the shared insight cache so the first visitor question on a
      // room/work is already deep (no cold Cortex wait). Bounded, fire-and-forget.
      prewarmInsights(ctx);
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

  // Spatial awareness: which room is at a given world point? Public, keyless.
  // Returns the room the point is inside (if any) plus every room's registered
  // world location — so room apps / clients can reason about the layout too.
  router.get("/guide/exhibitions/:id/locate", async (req: any, res: any) => {
    const id = sanitizeId(req.params.id);
    if (!id) return errorJson(res, 400, "Invalid exhibition id", "BAD_REQUEST");
    const ctx = await loadContext(id);
    if (!ctx) {
      return errorJson(res, 404, "Exhibition not registered — spawn it with a guide first.", "NOT_FOUND");
    }
    const x = Number(req.query.x);
    const z = Number(req.query.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      return errorJson(res, 400, "Provide numeric 'x' and 'z' world coordinates", "BAD_REQUEST");
    }
    const room = locateRoom(ctx, x, z);
    res.json({
      data: {
        exhibition: ctx.id,
        here: room
          ? { uid: room.uid, id: room.id, title: room.title, architect: room.architect, series: room.series }
          : null,
        rooms: ctx.rooms
          .filter((r) => r.location)
          .map((r) => ({ uid: r.uid, id: r.id, title: r.title, location: r.location })),
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
      const speak = body.speak !== false;
      const voice = clampText(body.voice, 40) || venice?.defaultVoice || "";

      // Spatial awareness. The in-world guide now resolves the visitor's room
      // itself (from the baked room footprints) and sends `roomUid` — authoritative,
      // so the guide tracks them as they walk between rooms. We trust that when
      // present, and fall back to mapping the reported `visitorPos` to a room
      // (the room they're inside, else the nearest) for older guides / safety.
      const roomUid = clampText(body.roomUid, 40);
      const vp = body.visitorPos;
      const here =
        (roomUid ? ctx.rooms.find((r) => r.uid === roomUid) ?? null : null) ||
        (vp && typeof vp.x === "number" && vp.x === vp.x && typeof vp.z === "number" && vp.z === vp.z
          ? whereIs(ctx, vp.x, vp.z)
          : null);

      // The specific work the visitor is standing in front of (resolved in-world
      // from their position). Grounds "which artwork is this?" on the right piece.
      const rawFocus = body.focus;
      const focus =
        rawFocus && typeof rawFocus === "object" && (rawFocus.title || rawFocus.artist)
          ? { title: clampText(rawFocus.title, 160), artist: clampText(rawFocus.artist, 120) }
          : null;

      const history = Array.isArray(body.history)
        ? body.history
            .filter((m: any) => m && typeof m.content === "string" && typeof m.role === "string")
            .slice(-MAX_HISTORY)
        : [];

      // ---- FAST PATH (hybrid) — a direct, non-Cortex reply for reactivity ----
      // Cortex then mines deeper insights asynchronously for the next turn.
      if (museumAgent?.configured) {
        const sessionId = sanitizeSession(body.session);
        const session = sessionId
          ? await getSession(id, sessionId, history)
          : // No session id (e.g. a stateless/.hyp caller): still reply fast, just
            // without server-side memory — seed turns from the shipped history.
            ({
              key: "",
              at: 0,
              turns: history.map((m: any) => ({
                role: m.role === "assistant" ? "assistant" : "user",
                content: String(m.content).slice(0, 2000),
              })),
              summary: "",
              insights: [],
              insightTopics: [],
              pendingInsight: false,
              summarizing: false,
              pendingFollowup: null,
            } as GuideSession);

        // Has the visitor walked into a different room since their last turn?
        // (Only meaningful once we've seen them somewhere before.) Tell the
        // model loudly so it narrates where they ARE now, then remember it.
        const movedRooms = !!(here && session.lastRoomUid && session.lastRoomUid !== here.uid);
        if (here) session.lastRoomUid = here.uid;

        // Macro / historical / artist-deep questions route straight to the
        // Library: a quick in-character acknowledgement now, the real answer via
        // the follow-up. (The fast model would otherwise pad a misleading
        // mini-answer from the works on show.) Everything else answers fast.
        const library = cortex.configured && needsLibrary(ctx, question);
        let answer = "";
        let delivered = false;
        const priorWasAck = library;

        if (library) {
          const ack = await makeAck(persona, question, voice, speak);
          answer = ack.text;
          // The visitor starts waiting now — open the bridge-filler window and
          // clear any fillers left over from a previous turn.
          session.libAskedAt = Date.now();
          session.lastBridgeAt = 0;
          session.bridges = [];
          res.json({
            data: {
              answer,
              persona: persona.name,
              suggestions,
              mode: "fast",
              // The ack is a holding line, NOT the answer — tell the guide the
              // real answer is being looked up so it shows a "consulting the
              // library" state (and keeps it until the follow-up lands).
              consulting: true,
              ...(ack.audioUrl ? { audioUrl: ack.audioUrl } : {}),
              ...(ack.audioUrls.length ? { audioUrls: ack.audioUrls } : {}),
              ...(ack.audioChunks.length ? { audioChunks: ack.audioChunks } : {}),
            },
          });
          delivered = true;
        } else {
          // Deep FIRST answer: fold any insights already cached for this topic
          // (pre-warmed at registration, or mined for an earlier visitor) in
          // before building context — a cheap lookup, no added latency.
          for (const ins of await gatherSharedInsights(ctx, question, here)) addSessionInsight(session, ins);
          const { status: fastStatus, text, error: fastError } = await museumAgent.chat({
            timeoutMs: FAST_REPLY_TIMEOUT_MS,
            maxTokens: FAST_REPLY_MAX_TOKENS,
            messages: [
              { role: "system", content: buildSystemContext(ctx, persona, session, here, focus, movedRooms) },
              ...turnMessages(session),
              { role: "user", content: question },
            ],
          });
          if (fastStatus === 200 && text) {
            answer = text.replace(/\s*\[src_[^\]]*\]/g, "").trim();
            // Pre-warm synth NOW so it runs in parallel with the visitor reading
            // the text and the client's audio GET hits a warm/in-flight cache.
            // audioChunks covers the WHOLE answer (played back-to-back in-world,
            // each chunk's text revealed in lockstep with its voice).
            const { urls: audioUrls, chunks: audioChunks } = speak ? prepareVoice(answer, voice, true) : { urls: [], chunks: [] };
            res.json({
              data: {
                answer,
                persona: persona.name,
                suggestions,
                mode: "fast",
                ...(audioUrls[0] ? { audioUrl: audioUrls[0] } : {}),
                ...(audioUrls.length ? { audioUrls } : {}),
                ...(audioChunks.length ? { audioChunks } : {}),
              },
            });
            delivered = true;
          } else {
            warnUpstream(
              `MUSEUMAGENT fast reply failed (status ${fastStatus || "threw"}${fastError ? `: ${fastError}` : ""}) — ` +
                `falling back to ${cortex.configured ? "Cortex" : "exhibition context"}.`,
            );
            // fall through to the Cortex-primary / context-only paths below
          }
        }

        if (delivered) {
          // Async, after the reply is sent: fold the turn into session memory and
          // deliver the deeper, Cortex-backed answer via the follow-up channel
          // (which EXTENDS a real answer, or IS the answer after an ack).
          if (sessionId) {
            session.turns.push({ role: "user", content: question.slice(0, 2000) });
            session.turns.push({ role: "assistant", content: answer.slice(0, 2000) });
            if (session.turns.length > MAX_VERBATIM_TURNS * 2) {
              session.turns.splice(0, session.turns.length - MAX_VERBATIM_TURNS * 2);
            }
            void saveSession(session);
            if (!priorWasAck) void summarizeSession(session, question, answer);
            void mineInsight(ctx, session, persona, question, here, voice, speak, answer, priorWasAck);
          }
          return;
        }
      }

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

      const ask: CortexAskBody = {
        question,
        // Visitors want a FAST reply, not deep research — use the lean chat
        // path: never agentic, no multi-hop graph traversal, a small top_k.
        // (The latency floor is Cortex's answer-generation LLM, ~10-15s, which
        // the guide can't cut from here; in-world can't stream the tokens.)
        top_k: 4,
        use_graph: false,
        use_agentic: false,
        conversation_history: [
          { role: "user", content: contextBlock(ctx, persona) },
          { role: "assistant", content: `Understood — I am ${persona.name}, guiding visitors through “${ctx.name}”.` },
          ...(locationLine(here) ? [{ role: "user", content: locationLine(here) as string }] : []),
          ...(focusLine(focus) ? [{ role: "user", content: focusLine(focus) as string }] : []),
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

      // TTS speaks ONLY the agent model's voice (the gemma fast path). Here we're
      // on the Cortex path: voice it only in pure legacy mode (no MUSEUMAGENT —
      // Cortex IS the guide's brain). When MUSEUMAGENT is configured but this turn
      // failed over to Cortex, stay text-only rather than speaking raw retrieval.
      const { urls: audioUrls, chunks: audioChunks } =
        speak && !museumAgent?.configured ? prepareVoice(answer, voice) : { urls: [], chunks: [] };

      res.json({
        data: {
          answer,
          persona: persona.name,
          suggestions,
          sources,
          mode: "cortex",
          ...(audioUrls[0] ? { audioUrl: audioUrls[0] } : {}),
          ...(audioUrls.length ? { audioUrls } : {}),
          ...(audioChunks.length ? { audioChunks } : {}),
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

  // Proactive follow-up (public, keyless). The in-world guide polls this for a
  // short window after a fast reply; when an async Cortex mine has landed a NEW
  // insight, the guide composed a short in-character aside which we hand back
  // ONCE (then clear it). Closes the loop so deeper knowledge actually reaches
  // the visitor — not just maybe-helps a later question. Cheap: no LLM here.
  //
  // While a library-routed answer is still being mined, this ALSO hands out the
  // pre-minted "still researching" bridge fillers (flagged `bridge:true`) once
  // the wait crosses ~4s — paced ~4s apart — so the guide keeps the visitor
  // company instead of going silent. The in-world guide keeps polling after a
  // bridge (it isn't the answer), and stops once the real follow-up lands.
  const BRIDGE_GAP_MS = 4000;
  router.get("/guide/followup", async (req: any, res: any) => {
    if (!allowFollowup(req)) {
      res.set("Retry-After", "10");
      return errorJson(res, 429, "Polling too fast — ease off.", "RATE_LIMITED");
    }
    const id = sanitizeId(req.query.exhibition);
    const sid = sanitizeSession(req.query.session);
    if (!id || !sid) return res.json({ data: null });
    const session = await peekSession(id, sid);
    const now = Date.now();
    const fu = session?.pendingFollowup;

    // The real answer is ready → deliver it (and drop any unused fillers).
    if (session && fu && now - fu.at <= FOLLOWUP_TTL_MS) {
      session.pendingFollowup = null;
      session.bridges = [];
      session.libAskedAt = 0;
      void saveSession(session);
      return res.json({
        data: {
          text: fu.text,
          ...(fu.audioUrl ? { audioUrl: fu.audioUrl } : {}),
          ...(fu.audioUrls && fu.audioUrls.length ? { audioUrls: fu.audioUrls } : {}),
          ...(fu.audioChunks && fu.audioChunks.length ? { audioChunks: fu.audioChunks } : {}),
        },
      });
    }

    // No answer yet, but the visitor has been waiting a beat — bridge the gap.
    if (
      session &&
      Array.isArray(session.bridges) &&
      session.bridges.length &&
      session.libAskedAt &&
      now - session.libAskedAt >= BRIDGE_GAP_MS &&
      now - (session.lastBridgeAt || 0) >= BRIDGE_GAP_MS
    ) {
      const bridge = session.bridges.shift();
      session.lastBridgeAt = now;
      void saveSession(session);
      if (bridge) {
        return res.json({
          data: {
            text: bridge.text,
            bridge: true,
            ...(bridge.audioUrls[0] ? { audioUrl: bridge.audioUrls[0] } : {}),
            ...(bridge.audioUrls.length ? { audioUrls: bridge.audioUrls } : {}),
            ...(bridge.audioChunks.length ? { audioChunks: bridge.audioChunks } : {}),
          },
        });
      }
    }

    // Nothing to send (and clear an expired follow-up if one lingered).
    if (session && fu) {
      session.pendingFollowup = null;
      void saveSession(session);
    }
    return res.json({ data: null });
  });

  // Serve a synthesized answer's audio (public, keyless like the rest of the
  // guide). The id is minted by /guide/ask; bytes live in the short-TTL cache.
  router.get("/guide/tts/:file", async (req: any, res: any) => {
    const id = String(req.params.file || "").replace(/\.mp3$/i, "").replace(/[^\w]/g, "").slice(0, 16);
    let audio: { bytes: Buffer; ct: string } | null = null;
    try {
      audio = id ? await synthPending(id) : null;
    } catch (e: any) {
      return errorJson(res, 502, e?.message || "TTS synthesis failed", "UPSTREAM");
    }
    if (!audio) {
      return errorJson(res, 404, "Audio expired or not found — ask the guide again.", "NOT_FOUND");
    }
    res.set("Content-Type", audio.ct || "audio/mpeg");
    res.set("Cache-Control", "public, max-age=900");
    res.send(audio.bytes);
  });
}
