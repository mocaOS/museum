import config from "@local/config";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refresh_token?: string }>(event);
  const authHeader = getRequestHeader(event, "authorization");

  if (!body?.refresh_token && !authHeader) {
    throw createError({ statusCode: 400, statusMessage: "Missing refresh_token or Authorization header" });
  }

  const directusUrl = config.api.baseUrl;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (authHeader) headers.Authorization = authHeader;

  const payload: Record<string, any> = { mode: "json" };
  if (body?.refresh_token) payload.refresh_token = body.refresh_token;

  console.log({
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const res = await fetch(`${directusUrl}/auth/refresh`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw createError({ statusCode: res.status, statusMessage: err?.errors?.[0]?.message || err?.error?.message || "Refresh failed" });
  }

  // Return upstream response as-is to match token pointers in config
  const json = await res.json();
  return json;
});
