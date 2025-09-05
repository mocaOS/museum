import config from "@local/config";

export default defineEventHandler(async (event) => {
  const authHeader = getRequestHeader(event, "authorization");
  const directusUrl = config.api.baseUrl;

  if (!authHeader) {
    // Even if no token is present, respond 200 to allow client-side cleanup
    return { ok: true };
  }

  const res = await fetch(`${directusUrl}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({ mode: "json" }),
  });

  if (!res.ok) {
    // Swallow upstream errors, surface as ok=false but HTTP 200 to simplify client behavior
    return { ok: false };
  }

  return { ok: true };
});


