import { AskRequest, Collection, Source, GraphContext, RetrievalStats, StreamStatus } from "@/types";

const PROXY_PREFIX = "/api/proxy";

function getHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${PROXY_PREFIX}${path}`, {
    ...options,
    headers: {
      ...getHeaders(),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res;
}

export async function fetchCollections(): Promise<Collection[]> {
  const res = await apiFetch("/api/collections");
  const data = await res.json();
  return data.collections || [];
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
}

export async function askQuestionStream(
  req: AskRequest,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
) {
  // Route through our Next.js API proxy to avoid gzip buffering.
  // Browsers always send Accept-Encoding: gzip which causes the backend's
  // compressed SSE response to be buffered until full gzip blocks complete,
  // breaking real-time streaming. The proxy requests uncompressed data.
  const res = await fetch("/api/ask/stream", {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(req),
    signal,
  });

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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
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
}
