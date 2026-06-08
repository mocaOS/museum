import { getAuth } from "@/lib/auth/session";
import { getGroupChatKey } from "@/lib/auth/backend-key";
import { getPublicChatKey } from "@/lib/auth/public-key";
import { getBackendUrl } from "@/lib/backend";
import { db } from "@/lib/db/client";
import { usageEvents } from "@/lib/db/schema";
import { newId } from "@/lib/auth/crypto";
import { getAppSettings } from "@/lib/settings";
import {
  injectCortexAnalytics,
  renderCortexAnalytics,
} from "@/lib/cortex-analytics";

export const dynamic = "force-dynamic";

/**
 * SSE streaming proxy with per-user key injection.
 *
 * Browsers always send `Accept-Encoding: gzip` and this header cannot be
 * overridden from client-side fetch. When the backend compresses the SSE
 * stream the browser's decompressor buffers chunks until a full gzip block
 * is available, which defeats real-time streaming. We request upstream with
 * `Accept-Encoding: identity` so data arrives uncompressed.
 */
export async function POST(request: Request) {
  // Public Library: logged-in members use their group-scoped key; everyone
  // else (anonymous visitors) uses the museum's public key (all collections).
  const ctx = await getAuth();
  const resolved =
    (ctx && getGroupChatKey(ctx.user)) || getPublicChatKey();
  if (!resolved) {
    return new Response(
      JSON.stringify({ error: "Library is not configured (missing CORTEX_API_KEY)." }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const apiUrl = getBackendUrl();
  const body = await request.text();

  if (ctx) {
    let collectionId: string | null = null;
    try {
      collectionId = JSON.parse(body)?.collection_id ?? null;
    } catch {}
    db.insert(usageEvents)
      .values({
        id: newId(),
        userId: ctx.user.id,
        kind: "message",
        collectionId,
        metadata: JSON.stringify({ path: "/api/ask/stream" }),
      })
      .run();
  }

  const rendered = ctx
    ? renderCortexAnalytics(getAppSettings().cortexAnalyticsTemplate, ctx.user)
    : null;
  const upstreamBody = injectCortexAnalytics(body, rendered);

  try {
    const upstream = await fetch(`${apiUrl}/api/ask/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": resolved.apiKey,
        "Accept-Encoding": "identity",
      },
      body: upstreamBody,
      // NB: do NOT forward request.signal here — in the standalone Node server
      // the request signal aborts as soon as this handler returns the streaming
      // Response, which would cut the upstream stream off after its first event.
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, {
        status: upstream.status,
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
