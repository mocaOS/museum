import { getCortexUrl, getCortexKey } from "@/lib/cortex";
import { getAppSettings } from "@/lib/settings";
import { injectCortexAnalytics } from "@/lib/cortex-analytics";

export const dynamic = "force-dynamic";

// The Library proxy is anonymous and public by design; CORS lets trusted
// sibling surfaces (the API docs' chat widget at docs.museumofcryptoart.com)
// use it from the browser. There is no auth to leak — the Cortex key stays
// server-side either way.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Request-ID",
  "Access-Control-Expose-Headers": "X-Request-ID, Retry-After",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/**
 * SSE streaming proxy. The public Library uses one read-only Cortex key
 * (CORTEX_API_KEY) for everyone — no auth, no per-user keys.
 *
 * Browsers always send `Accept-Encoding: gzip` and this header cannot be
 * overridden from client-side fetch. When the backend compresses the SSE
 * stream the browser's decompressor buffers chunks until a full gzip block
 * is available, which defeats real-time streaming. We request upstream with
 * `Accept-Encoding: identity` so data arrives uncompressed.
 */
export async function POST(request: Request) {
  const apiKey = getCortexKey();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Library is not configured (missing CORTEX_API_KEY)." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiUrl = getCortexUrl();
  const body = await request.text();

  // Optionally prepend a static context block for Cortex agent skills.
  const upstreamBody = injectCortexAnalytics(
    body,
    getAppSettings().cortexAnalyticsTemplate
  );

  // Correlation id: reuse the client's, or mint one. Cortex echoes and forwards
  // it to cortex-helper, so all services log the same id for one user action.
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const upstream = await fetch(`${apiUrl}/api/ask/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
        "Accept-Encoding": "identity",
        "X-Request-ID": requestId,
      },
      body: upstreamBody,
      // NB: do NOT forward request.signal here — in the standalone Node server
      // the request signal aborts as soon as this handler returns the streaming
      // Response, which would cut the upstream stream off after its first event.
    });

    if (!upstream.ok) {
      const errorHeaders: Record<string, string> = {
        ...CORS_HEADERS,
        "X-Request-ID": requestId,
      };
      // Pass burst rate-limit hints through so the client can honor them.
      const retryAfter = upstream.headers.get("Retry-After");
      if (retryAfter) errorHeaders["Retry-After"] = retryAfter;

      return new Response(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
        headers: errorHeaders,
      });
    }

    if (!upstream.body) {
      return new Response("No upstream body", { status: 502 });
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-ID": requestId,
        ...CORS_HEADERS,
      },
    });
  } catch (err) {
    console.error("Stream proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
