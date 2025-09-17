import config from "@local/config";
import { getUserSession, setUserSession } from "#imports";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const refreshToken = (session as any)?.refresh_token;
  if (!refreshToken) {
    throw createError({ statusCode: 400, statusMessage: "Missing refresh token" });
  }

  const directusUrl = config.api.baseUrl;
  const res = await fetch(`${directusUrl}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "json", refresh_token: refreshToken }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw createError({ statusCode: res.status, statusMessage: err?.errors?.[0]?.message || err?.error?.message || "Refresh failed" });
  }

  const tokens = await res.json();
  const accessToken: string | undefined = tokens?.data?.access_token;
  const newRefreshToken: string | undefined = tokens?.data?.refresh_token || refreshToken;
  if (!accessToken) {
    throw createError({ statusCode: 502, statusMessage: "Invalid refresh response" });
  }

  await setUserSession(event, {
    ...(session as any),
    access_token: accessToken,
    refresh_token: newRefreshToken,
  });

  return { ok: true };
});
