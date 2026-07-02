/**
 * Cortex (RAG) integration for the public /v1 API — "the Library".
 *
 * MOCA runs a Cortex instance (https://cortex.eco, docs.cortex.eco) holding the
 * museum's knowledge base: writings, lore, artist interviews, curated docs.
 * The MOCA API exposes its read surface — Q&A (plain + SSE streaming), hybrid
 * search, and the collection list — behind the integrator's MOCA key, while
 * the Cortex key itself stays server-side.
 *
 * Env: CORTEX_API_URL (e.g. https://library.moca.qwellco.de) and
 * CORTEX_API_KEY (a read-only key). Unset → /v1/library/* answers 503.
 */

const UPSTREAM_TIMEOUT_MS = 120_000;

export interface CortexAskBody {
  question: string;
  collection_id?: string;
  top_k?: number;
  use_agentic?: boolean;
  use_graph?: boolean;
  use_reranking?: boolean;
  /** Simple vector-only path (disables hybrid/reranking) — cortex-app's fast
   * answer mode. Only honored on the STREAMING endpoint upstream; ignored by
   * non-streaming /api/ask. */
  use_fast_search?: boolean;
  /** Graph traversal depth (1-3) when use_graph is on. */
  max_hops?: number;
  conversation_history?: { role: string; content: string }[];
  /** Opaque, client-carried conversation-memory blob (cortex-app's multi-bucket
   * context curator). Sent verbatim; the upstream returns an updated blob via a
   * `memory_update` SSE event. We never construct or mutate it — pure passthrough. */
  conversation_memory?: unknown;
}

// Bound the opaque memory blob so the proxy can't be used to push arbitrarily
// large payloads upstream; a real curated blob is a few KB.
const MAX_MEMORY_BYTES = 256_000;

export function createCortexClient(env: Record<string, any>) {
  const base = String(env.CORTEX_API_URL || "").replace(/\/$/, "");
  const key = String(env.CORTEX_API_KEY || "");

  const configured = !!(base && key);

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": key,
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  }

  /** Clamp client-supplied options to safe ranges; drop everything else. */
  function sanitizeAsk(body: CortexAskBody) {
    const history = Array.isArray(body.conversation_history)
      ? body.conversation_history
          .filter((m) => m && typeof m.content === "string" && typeof m.role === "string")
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
      : undefined;
    // Pass the opaque conversation-memory blob through verbatim when it's a
    // plain object within the size bound — never reshape it (it's cortex-app's
    // to own; the museum app stores and replays exactly what came back).
    let memory: unknown;
    if (body.conversation_memory && typeof body.conversation_memory === "object") {
      try {
        if (JSON.stringify(body.conversation_memory).length <= MAX_MEMORY_BYTES) {
          memory = body.conversation_memory;
        }
      } catch {
        /* non-serializable blob — drop it rather than fail the request */
      }
    }
    return {
      question: String(body.question || "").slice(0, 8000),
      top_k: Math.max(1, Math.min(20, Number(body.top_k) || 5)),
      use_graph: body.use_graph !== false,
      use_agentic: body.use_agentic === true,
      ...(body.use_reranking !== undefined ? { use_reranking: body.use_reranking !== false } : {}),
      ...(body.use_fast_search === true ? { use_fast_search: true } : {}),
      ...(Number.isFinite(Number(body.max_hops))
        ? { max_hops: Math.max(1, Math.min(3, Math.trunc(Number(body.max_hops)))) }
        : {}),
      ...(body.collection_id ? { collection_id: String(body.collection_id) } : {}),
      ...(history?.length ? { conversation_history: history } : {}),
      ...(memory !== undefined ? { conversation_memory: memory } : {}),
    };
  }

  return {
    configured,

    async ask(body: CortexAskBody): Promise<{ status: number; body: any }> {
      const res = await call("/api/ask", {
        method: "POST",
        body: JSON.stringify(sanitizeAsk(body)),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },

    /**
     * Ask over the STREAMING endpoint but buffer it into the same
     * `{ status, body: { answer, sources } }` shape as ask(). This is the
     * cortex-app-sanctioned path for anything that can run long: the
     * non-streaming /api/ask now enforces a hard server-side deadline
     * (ASK_DEADLINE_SECONDS, default 28s → structured 504), and before that
     * deadline existed the edge proxy cut the silent buffered socket as a
     * bare 500 at ~30-60s. /api/ask/stream sends `: ping` heartbeats, so the
     * connection survives as long as the work does; we impose our OWN cap via
     * `timeoutMs` sized to the caller's UX window instead.
     */
    async askBuffered(
      body: CortexAskBody,
      opts: { timeoutMs?: number } = {},
    ): Promise<{ status: number; body: any }> {
      let res: Response;
      const signal = AbortSignal.timeout(opts.timeoutMs ?? UPSTREAM_TIMEOUT_MS);
      try {
        res = await fetch(`${base}/api/ask/stream`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Accept-Encoding": "identity",
            "X-API-Key": key,
          },
          body: JSON.stringify(sanitizeAsk(body)),
          signal,
        });
      } catch (e: any) {
        return { status: 0, body: { _error: e?.message || "fetch failed" } };
      }
      if (res.status !== 200 || !res.body) {
        return { status: res.status || 0, body: await res.json().catch(() => null) };
      }
      let answer = "";
      let sources: any[] = [];
      let upstreamError: string | null = null;
      let done = false;
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { value, done: eos } = await reader.read();
          if (signal.aborted) break;
          buf += value ? decoder.decode(value, { stream: true }) : "";
          // SSE frames are \n\n-separated; comment lines (`: ping`) and
          // status/graph_context/memory_update events are skipped. NB: `done`
          // is no longer guaranteed to be the LAST frame (memory_update can
          // follow it) — but we carry no conversation_memory here, and we
          // stop reading at `done` regardless: everything we consume
          // (answer + sources) has landed by then.
          for (;;) {
            const sep = buf.indexOf("\n\n");
            if (sep === -1) break;
            const frame = buf.slice(0, sep);
            buf = buf.slice(sep + 2);
            for (const line of frame.split("\n")) {
              if (!line.startsWith("data:")) continue;
              let ev: any;
              try {
                ev = JSON.parse(line.slice(5).trim());
              } catch {
                continue;
              }
              if (typeof ev?.content === "string") answer += ev.content;
              if (Array.isArray(ev?.sources)) sources = ev.sources;
              if (typeof ev?.error === "string") upstreamError = ev.error;
              if (ev?.done === true) done = true;
            }
            if (done || upstreamError) break;
          }
          if (done || upstreamError || eos) break;
        }
      } catch (e: any) {
        if (!answer) return { status: 0, body: { _error: e?.message || "stream failed" } };
        // Timed out / dropped mid-answer: a partial answer is still useful.
      } finally {
        reader.cancel().catch(() => {});
      }
      if (upstreamError && !answer) return { status: 502, body: { _error: upstreamError } };
      if (!answer.trim()) return { status: 502, body: { _error: "empty stream (no content before close)" } };
      return { status: 200, body: { answer, sources } };
    },

    /** Raw upstream Response for SSE passthrough (body is a web stream). */
    async askStream(body: CortexAskBody): Promise<Response> {
      return fetch(`${base}/api/ask/stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          "Accept-Encoding": "identity",
          "X-API-Key": key,
        },
        body: JSON.stringify(sanitizeAsk(body)),
        // No overall timeout: research streams legitimately run minutes.
      });
    },

    async search(body: {
      query: string;
      top_k?: number;
      collection_id?: string;
    }): Promise<{ status: number; body: any }> {
      const res = await call("/api/search", {
        method: "POST",
        body: JSON.stringify({
          query: String(body.query || "").slice(0, 2000),
          top_k: Math.max(1, Math.min(25, Number(body.top_k) || 5)),
          ...(body.collection_id
            ? { filters: { collection_id: String(body.collection_id) } }
            : {}),
        }),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    },

    async collections(): Promise<{ status: number; body: any }> {
      const res = await call("/api/collections");
      return { status: res.status, body: await res.json().catch(() => null) };
    },
  };
}
