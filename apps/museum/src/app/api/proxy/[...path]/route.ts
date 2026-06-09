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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": apiKey,
  };

  const bodyText =
    method !== "GET" && method !== "HEAD" ? await request.text() : undefined;

  try {
    const res = await fetch(upstream, {
      method,
      headers,
      ...(bodyText !== undefined ? { body: bodyText } : {}),
    });

    return new Response(res.body, {
      status: res.status,
      headers: {
        "Content-Type": res.headers.get("Content-Type") || "application/json",
      },
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
