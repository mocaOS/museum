/**
 * Museum Agent — the FAST, direct LLM the in-world museum guide replies with.
 *
 * The hybrid guide (see guide.ts) answers every visitor turn with a quick,
 * non-Cortex chat completion so the conversation stays reactive; Cortex then
 * mines deeper knowledge asynchronously into a separate insights bucket. This
 * client is that fast path — an OpenAI-compatible chat-completions endpoint
 * (MOCA points it at Venice). The MOCA API holds the key server-side; it never
 * reaches the browser or the Hyperfy world (same posture as the Cortex/Venice
 * keys).
 *
 * Env: MUSEUMAGENT_BASEURL (OpenAI-compatible base, e.g.
 * https://api.venice.ai/api/v1), MUSEUMAGENT_API_KEY (Bearer), MUSEUMAGENT_MODEL
 * (e.g. e2ee-gemma-4-26b-a4b-uncensored-p). Unset → the guide stays on its
 * Cortex-primary path (no fast replies), no error.
 *
 * API shape: POST {base}/chat/completions, Bearer auth, body
 * { model, messages:[{role,content}], temperature, max_tokens, stream:false } →
 * { choices:[{ message:{ content } }] }.
 */

const DEFAULT_TIMEOUT_MS = 25_000;
// Per-message hard cap — must stay ABOVE guide.ts MAX_CONTEXT_CHARS (48k) so a
// within-budget system prompt is never silently truncated by the transport.
const MSG_MAX_CHARS = 64_000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface MuseumAgentChat {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export function createMuseumAgentClient(env: Record<string, any>) {
  const base = String(env.MUSEUMAGENT_BASEURL || "").replace(/\/$/, "");
  const key = String(env.MUSEUMAGENT_API_KEY || "");
  const model = String(env.MUSEUMAGENT_MODEL || "");

  const configured = !!(base && key && model);

  return {
    configured,
    model,

    /**
     * One non-streaming chat completion. Returns the assistant text (or empty on
     * any non-200 / malformed response — callers fall back to Cortex/context).
     */
    async chat({
      messages,
      temperature = 0.7,
      maxTokens = 700,
      timeoutMs = DEFAULT_TIMEOUT_MS,
    }: MuseumAgentChat): Promise<{ status: number; text: string; error?: string }> {
      if (!configured) return { status: 0, text: "", error: "not configured" };
      const safeMessages = messages
        .filter((m) => m && typeof m.content === "string" && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content.slice(0, MSG_MAX_CHARS) }));
      if (!safeMessages.length) return { status: 0, text: "", error: "no messages" };
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: safeMessages,
            temperature,
            max_tokens: maxTokens,
            stream: false,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) {
          // Surface WHY (bad model slug, auth, etc.) — invaluable when the guide
          // silently falls back to Cortex. Body is small; clamp it.
          const errBody = await res.text().catch(() => "");
          return { status: res.status, text: "", error: errBody.slice(0, 300) };
        }
        const body = await res.json().catch(() => null);
        const text = body?.choices?.[0]?.message?.content;
        if (typeof text !== "string" || !text.trim()) {
          return { status: 200, text: "", error: "200 but no choices[0].message.content" };
        }
        return { status: 200, text: text.trim() };
      } catch (e: any) {
        return { status: 0, text: "", error: e?.name === "TimeoutError" ? `timeout after ${timeoutMs}ms` : String(e?.message || e) };
      }
    },
  };
}

export type MuseumAgentClient = ReturnType<typeof createMuseumAgentClient>;
