import { getCortexUrl, getCortexKey } from "@/lib/cortex";

export const dynamic = "force-dynamic";

async function proxyRequest(request: Request, method: string) {
  // Public Library: every request uses the single read-only Cortex key.
  const apiKey = getCortexKey();
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Library is not configured (missing CORTEX_API_KEY)." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiUrl = getCortexUrl();
  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/api\/proxy/, "");
  const upstream = `${apiUrl}${upstreamPath}${url.search}`;

  // Correlation id: reuse the client's, or mint one. Cortex echoes and forwards
  // it to cortex-helper, so all services log the same id for one user action.
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
    "X-Request-ID": requestId,
  };

  const bodyText =
    method !== "GET" && method !== "HEAD" ? await request.text() : undefined;

  try {
    const res = await fetch(upstream, {
      method,
      headers,
      ...(bodyText !== undefined ? { body: bodyText } : {}),
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type": res.headers.get("Content-Type") || "application/json",
      "X-Request-ID": requestId,
    };
    // Pass burst rate-limit hints through so the client can honor them.
    const retryAfter = res.headers.get("Retry-After");
    if (retryAfter) responseHeaders["Retry-After"] = retryAfter;

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error(`Proxy error [${method} ${upstream}]:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: Request) {
  return proxyRequest(request, "GET");
}

export async function POST(request: Request) {
  return proxyRequest(request, "POST");
}
