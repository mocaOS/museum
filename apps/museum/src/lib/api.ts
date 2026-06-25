import { AskRequest, Collection, Source, GraphContext, RetrievalStats, StreamStatus } from "@/types";

const PROXY_PREFIX = "/api/proxy";

function getHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

// One id per user action, forwarded as X-Request-ID through every proxied
// call. The backend echoes and forwards it (museum -> Cortex -> cortex-helper),
// so log lines across all services share one id.
function newRequestId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number | null) {
    super("Rate limited");
    this.name = "RateLimitError";
  }
}

// Retry-After can be delta-seconds or an HTTP date.
function parseRetryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs)) return Math.max(0, Math.ceil(secs));
  const date = Date.parse(raw);
  if (Number.isNaN(date)) return null;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const RETRY_ATTEMPTS = 3;

// Exponential backoff 0.5s -> 4s with jitter (50–100% of the step).
function retryDelay(attempt: number): number {
  const step = Math.min(4000, 500 * 2 ** attempt);
  return step / 2 + Math.random() * (step / 2);
}

async function apiFetch(path: string, options?: RequestInit) {
  const method = (options?.method ?? "GET").toUpperCase();
  const headers = {
    ...getHeaders(),
    "X-Request-ID": newRequestId(),
    ...options?.headers,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${PROXY_PREFIX}${path}`, { ...options, headers });
    } catch (err) {
      // fetch() rejected: no response was received, so the request either
      // never connected or never completed sending — safe to retry for any
      // method (closest browser approximation of connect-failure-before-send).
      lastError = err;
      if (attempt < RETRY_ATTEMPTS - 1) {
        await sleep(retryDelay(attempt));
        continue;
      }
      throw err;
    }

    // Honor Retry-After instead of hammering — never auto-retry a 429.
    if (res.status === 429) {
      throw new RateLimitError(parseRetryAfter(res));
    }

    // Only idempotent GETs retry on 5xx; a POST may already have had effects.
    if (res.status >= 500 && method === "GET" && attempt < RETRY_ATTEMPTS - 1) {
      await sleep(retryDelay(attempt));
      continue;
    }

    if (!res.ok) {
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res;
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed");
}

// GET /api/collections has no pagination on the backend; cache the list with
// a short TTL (and dedupe in-flight calls) instead of refetching per render.
const COLLECTIONS_TTL_MS = 60_000;
let collectionsCache: { data: Collection[]; expires: number } | null = null;
let collectionsInFlight: Promise<Collection[]> | null = null;

export async function fetchCollections(): Promise<Collection[]> {
  if (collectionsCache && Date.now() < collectionsCache.expires) {
    return collectionsCache.data;
  }
  if (collectionsInFlight) return collectionsInFlight;
  collectionsInFlight = (async () => {
    try {
      const res = await apiFetch("/api/collections");
      const data = await res.json();
      const collections: Collection[] = data.collections || [];
      collectionsCache = {
        data: collections,
        expires: Date.now() + COLLECTIONS_TTL_MS,
      };
      return collections;
    } finally {
      collectionsInFlight = null;
    }
  })();
  return collectionsInFlight;
}

export async function askQuestion(req: AskRequest) {
  const res = await apiFetch("/api/ask", {
    method: "POST",
    body: JSON.stringify(req),
  });
  return res.json();
}

export async function generateChatTitle(
  userMessage: string,
  assistantMessage: string
): Promise<string> {
  try {
    let title = "";
    await askQuestionStream(
      {
        question: `Generate a very short title (max 6 words, no quotes, no punctuation at the end) for this conversation. Respond ONLY with the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${assistantMessage.slice(0, 500)}`,
        use_graph: false,
        use_reranking: false,
        use_agentic: false,
        conversation_history: [],
        collection_id: null,
      },
      {
        onContent: (token) => { title += token; },
        onSources: () => {},
        onGraphContext: () => {},
        onThinking: () => {},
        onSubQuestions: () => {},
        onRetrieval: () => {},
        onRetrievalStats: () => {},
        onStatus: () => {},
        onMemoryUpdate: () => {},
        onDone: () => {},
        onError: () => {},
      }
    );
    title = title.trim().replace(/^["']|["']$/g, "");
    return title.slice(0, 80) || "";
  } catch {
    return "";
  }
}

export interface DocumentContent {
  id: string;
  filename: string;
  chunks: { id: string; content: string; chunk_index: number }[];
}

export async function fetchDocumentContent(documentId: string): Promise<DocumentContent> {
  const res = await apiFetch(`/api/documents/${documentId}/content`);
  return res.json();
}

export interface StreamCallbacks {
  onContent: (token: string) => void;
  onSources: (sources: Source[]) => void;
  onGraphContext: (ctx: GraphContext) => void;
  onThinking: (step: string) => void;
  onSubQuestions: (questions: string[]) => void;
  onRetrieval: (info: string) => void;
  onRetrievalStats: (stats: RetrievalStats) => void;
  onStatus: (status: StreamStatus) => void;
  onMemoryUpdate: (memory: unknown) => void;
  onDone: () => void;
  onError: (error: string) => void;
  // Burst rate limit (429). retryAfterSeconds from the Retry-After header.
  onRateLimited?: (retryAfterSeconds: number | null) => void;
  // The backend ended the stream with `event: shutdown` (rolling restart) and
  // we are transparently resubmitting — reset any partial assistant output.
  onReconnect?: () => void;
}

// Resubmit at most this many times after a shutdown frame.
const MAX_RECONNECTS = 2;

export async function askQuestionStream(
  req: AskRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
) {
  // Route through our Next.js API proxy to avoid gzip buffering.
  // Browsers always send Accept-Encoding: gzip which causes the backend's
  // compressed SSE response to be buffered until full gzip blocks complete,
  // breaking real-time streaming. The proxy requests uncompressed data.
  // One request id across reconnects, so all attempts correlate in the logs.
  const requestId = newRequestId();

  for (let attempt = 0; attempt <= MAX_RECONNECTS; attempt++) {
    if (attempt > 0) {
      callbacks.onReconnect?.();
      await sleep(1000);
      if (signal?.aborted) return;
    }

    let res: Response;
    try {
      res = await fetch("/api/ask/stream", {
        method: "POST",
        headers: { ...getHeaders(), "X-Request-ID": requestId },
        body: JSON.stringify(req),
        signal,
      });
    } catch (err) {
      // Connect failure before any response — retry; rethrow aborts so the
      // caller's cancel handling still works.
      if (signal?.aborted || attempt >= MAX_RECONNECTS) throw err;
      continue;
    }

    if (res.status === 429) {
      const retryAfter = parseRetryAfter(res);
      if (callbacks.onRateLimited) callbacks.onRateLimited(retryAfter);
      else callbacks.onError(`API error: ${res.status}`);
      return;
    }

    if (!res.ok) {
      callbacks.onError(`API error: ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      callbacks.onError("No response body");
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let shutdown = false;

    readLoop: while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();

        // On rolling restarts the backend ends active streams with
        // `event: shutdown` + data {"reason": ...} instead of a dead socket.
        // Reconnect/resubmit transparently rather than surfacing an error.
        if (trimmed.startsWith("event:")) {
          if (trimmed.slice(6).trim() === "shutdown") {
            shutdown = true;
            break readLoop;
          }
          continue;
        }

        if (!trimmed.startsWith("data: ")) continue;

        const jsonStr = trimmed.slice(6);
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.content !== undefined) {
            callbacks.onContent(data.content);
          }
          if (data.sources) {
            callbacks.onSources(data.sources);
          }
          if (data.graph_context) {
            callbacks.onGraphContext(data.graph_context);
          }
          if (data.thinking) {
            callbacks.onThinking(data.thinking);
          }
          // Agent-research mode emits skill activity as `skill_tool` (+ optional
          // `skill_name`). Surface it in the thinking stream rather than dropping it.
          if (data.skill_tool) {
            callbacks.onThinking(
              data.skill_name
                ? `${data.skill_name}: ${data.skill_tool}`
                : String(data.skill_tool)
            );
          }
          if (data.sub_questions) {
            callbacks.onSubQuestions(data.sub_questions);
          }
          if (data.retrieval) {
            callbacks.onRetrieval(data.retrieval);
          }
          if (data.retrieval_stats) {
            callbacks.onRetrievalStats(data.retrieval_stats);
          }
          if (data.status) {
            callbacks.onStatus(data.status);
          }
          if (data.memory_update) {
            callbacks.onMemoryUpdate(data.memory_update);
          }
          if (data.done) {
            callbacks.onDone();
          }
          if (data.error) {
            callbacks.onError(data.error);
          }
        } catch {
          // skip malformed JSON lines
        }
      }
    }

    if (shutdown && attempt < MAX_RECONNECTS) {
      try {
        await reader.cancel();
      } catch {}
      continue;
    }
    if (shutdown) {
      callbacks.onError("Connection lost while the server was restarting");
    }
    return;
  }
}
