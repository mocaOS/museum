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
  conversation_history?: { role: string; content: string }[];
}

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
    return {
      question: String(body.question || "").slice(0, 8000),
      top_k: Math.max(1, Math.min(20, Number(body.top_k) || 5)),
      use_graph: body.use_graph !== false,
      use_agentic: body.use_agentic === true,
      ...(body.collection_id ? { collection_id: String(body.collection_id) } : {}),
      ...(history?.length ? { conversation_history: history } : {}),
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
