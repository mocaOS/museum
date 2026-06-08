import { getAuth } from "@/lib/auth/session";
import { getGroupChatKey } from "@/lib/auth/backend-key";
import { getPublicChatKey } from "@/lib/auth/public-key";
import { getBackendUrl } from "@/lib/backend";
import { db } from "@/lib/db/client";
import { usageEvents } from "@/lib/db/schema";
import { newId } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

async function proxyRequest(request: Request, method: string) {
  // Public Library: members use their group key; anonymous visitors use the
  // museum's public key (collections list, source documents, search).
  const ctx = await getAuth();
  const resolved = (ctx && getGroupChatKey(ctx.user)) || getPublicChatKey();
  if (!resolved) {
    return new Response(
      JSON.stringify({ error: "Library is not configured (missing CORTEX_API_KEY)." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiUrl = getBackendUrl();
  const url = new URL(request.url);
  const upstreamPath = url.pathname.replace(/^\/api\/proxy/, "");
  const upstream = `${apiUrl}${upstreamPath}${url.search}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-API-Key": resolved.apiKey,
  };

  const bodyText =
    method !== "GET" && method !== "HEAD" ? await request.text() : undefined;

  // Log /ask and /search as message usage events (fire-and-forget, members only).
  if (ctx && method === "POST" && /\/api\/(ask|search)(\/|$)/.test(upstreamPath)) {
    let collectionId: string | null = null;
    try {
      const parsed = bodyText ? JSON.parse(bodyText) : null;
      collectionId = parsed?.collection_id ?? null;
    } catch {}
    db.insert(usageEvents)
      .values({
        id: newId(),
        userId: ctx.user.id,
        kind: "message",
        collectionId,
        metadata: JSON.stringify({ path: upstreamPath, method }),
      })
      .run();
  }

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
