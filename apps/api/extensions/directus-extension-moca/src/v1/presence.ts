/**
 * Ephemeral presence for the docs Library chat — "who's asking, right now".
 *
 * Privacy model (deliberate, document-level): NOTHING here is persisted.
 * There is no table, no log, no replay. The hub is an in-memory fan-out:
 * when someone asks the Library, their client POSTs a ping (handle/address
 * only — never the question) and every *currently connected* listener sees
 * it. You only experience what happens while you're in the museum; arrive
 * later and the past simply doesn't exist for you. Questions and answers
 * live solely in each visitor's own browser storage.
 *
 * Routes (public, no API key — there's nothing sensitive to protect):
 * - GET  /v1/presence/stream — SSE feed of presence events
 * - POST /v1/presence/ping   — announce a Library search ({ handle? })
 */

interface Listener {
  id: number;
  write: (chunk: string) => void;
  end: () => void;
}

const MAX_LISTENERS = 500;
const MAX_PINGS_PER_MIN = 12;
const KEEPALIVE_MS = 25_000;
const HANDLE_MAX = 48;

let nextId = 1;
const listeners = new Map<number, Listener>();
const pingWindows = new Map<string, number[]>();

function broadcast(event: Record<string, unknown>) {
  const frame = `data: ${JSON.stringify(event)}\n\n`;
  for (const l of listeners.values()) {
    try {
      l.write(frame);
    } catch {
      listeners.delete(l.id);
    }
  }
}

/** Display-safe handle: printable, trimmed, anonymous fallback. */
function sanitizeHandle(raw: unknown): string {
  const s = String(raw ?? "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .trim()
    .slice(0, HANDLE_MAX);
  return s || "anon";
}

export function registerPresenceRoutes(router: any) {
  // Periodic comment keeps proxies from closing idle SSE connections.
  setInterval(() => {
    for (const l of listeners.values()) {
      try {
        l.write(`: keepalive\n\n`);
      } catch {
        listeners.delete(l.id);
      }
    }
  }, KEEPALIVE_MS).unref?.();

  router.get("/presence/stream", (req: any, res: any) => {
    if (listeners.size >= MAX_LISTENERS) {
      return res.status(503).json({
        errors: [{ message: "Presence is full right now.", extensions: { code: "BUSY" } }],
      });
    }
    res.status(200);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const id = nextId++;
    listeners.set(id, {
      id,
      write: (chunk) => res.write(chunk),
      end: () => res.end(),
    });

    // Greet the newcomer with the live count; tell the room someone arrived.
    res.write(`data: ${JSON.stringify({ type: "hello", here: listeners.size })}\n\n`);
    broadcast({ type: "arrived", here: listeners.size, at: Date.now() });

    req.on("close", () => {
      listeners.delete(id);
      broadcast({ type: "left", here: listeners.size, at: Date.now() });
    });
  });

  router.post("/presence/ping", (req: any, res: any) => {
    const ip = String(req.headers["x-forwarded-for"] || req.ip || "?").split(",")[0].trim();
    const now = Date.now();
    const hits = (pingWindows.get(ip) || []).filter((t) => now - t < 60_000);
    if (hits.length >= MAX_PINGS_PER_MIN) {
      res.set("Retry-After", "60");
      return res.status(429).json({
        errors: [{ message: "Slow down a little.", extensions: { code: "RATE_LIMITED" } }],
      });
    }
    hits.push(now);
    pingWindows.set(ip, hits);

    broadcast({
      type: "library-search",
      handle: sanitizeHandle(req.body?.handle),
      at: now,
    });
    res.json({ data: { ok: true, here: listeners.size } });
  });
}
