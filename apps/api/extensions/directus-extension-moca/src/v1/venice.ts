/**
 * Venice TTS integration for the public /v1 API — the museum guide's voice.
 *
 * MOCA uses Venice (https://venice.ai, docs.venice.ai) for text-to-speech so
 * the in-world guide can speak its answers aloud. The MOCA API holds the Venice
 * key server-side and exposes only synthesized audio (via /v1/guide/tts/:id.mp3);
 * the key never reaches the browser or the Hyperfy world.
 *
 * Env: VENICE_API_KEY (required to enable voice), VENICE_API_URL (default
 * https://api.venice.ai/api/v1), VENICE_TTS_MODEL (default tts-qwen3-1-7b),
 * VENICE_TTS_VOICE (default Serena). Unset key → guide answers stay text-only.
 *
 * API shape (docs.venice.ai): POST {base}/audio/speech, Bearer auth, body
 * { model, input (≤4096 chars), voice, response_format, speed, prompt? } →
 * binary audio bytes (mp3 by default).
 */

const UPSTREAM_TIMEOUT_MS = 30_000;
const MAX_INPUT = 4096;

export interface VeniceTtsResult {
  status: number;
  bytes: Buffer | null;
  contentType: string;
}

export function createVeniceClient(env: Record<string, any>) {
  const base = String(env.VENICE_API_URL || "https://api.venice.ai/api/v1").replace(/\/$/, "");
  const key = String(env.VENICE_API_KEY || "");
  const model = String(env.VENICE_TTS_MODEL || "tts-qwen3-1-7b");
  const defaultVoice = String(env.VENICE_TTS_VOICE || "Serena");
  // A light style cue the Qwen3 TTS model honours via its `prompt` param.
  const stylePrompt = String(
    env.VENICE_TTS_PROMPT || "Warm, measured, curatorial — an art guide speaking to a visitor.",
  );

  const configured = !!key;

  return {
    configured,
    defaultVoice,

    /** Synthesize speech for `text`; returns mp3 bytes (or status on failure). */
    async synthesize(text: string, voice?: string): Promise<VeniceTtsResult> {
      const input = String(text || "").replace(/\s+/g, " ").trim().slice(0, MAX_INPUT);
      if (!configured || !input) return { status: 0, bytes: null, contentType: "" };
      try {
        const res = await fetch(`${base}/audio/speech`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            input,
            voice: String(voice || defaultVoice),
            response_format: "mp3",
            speed: 1,
            ...(model.includes("qwen3") ? { prompt: stylePrompt } : {}),
          }),
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        });
        if (!res.ok) return { status: res.status, bytes: null, contentType: "" };
        const buf = Buffer.from(await res.arrayBuffer());
        return {
          status: 200,
          bytes: buf,
          contentType: res.headers.get("content-type") || "audio/mpeg",
        };
      } catch {
        return { status: 0, bytes: null, contentType: "" };
      }
    },
  };
}
