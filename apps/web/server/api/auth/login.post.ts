import config from "@local/config";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "Missing credentials" });
  }

  const directusUrl = config.api.baseUrl;
  const loginRes = await fetch(`${directusUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Nuxt-Auth-Local",
    },
    body: JSON.stringify({ email: body.email, password: body.password, mode: "json" }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.json().catch(() => ({ error: { message: loginRes.statusText } }));
    throw createError({ statusCode: loginRes.status, statusMessage: err?.errors?.[0]?.message || err?.error?.message || "Login failed" });
  }

  const tokens = await loginRes.json();
  const accessToken: string | undefined = tokens?.data?.access_token;
  const refreshToken: string | undefined = tokens?.data?.refresh_token;
  if (!accessToken) {
    throw createError({ statusCode: 502, statusMessage: "Invalid login response" });
  }

  // Fetch current user details
  const meRes = await fetch(`${directusUrl}/users/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!meRes.ok) {
    throw createError({ statusCode: meRes.status, statusMessage: "Failed to fetch user" });
  }
  const meJson = await meRes.json();
  const user = meJson?.data ?? null;

  await setUserSession(event, {
    user,
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return { ok: true };
});
