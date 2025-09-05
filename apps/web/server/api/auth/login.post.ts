import config from "@local/config";

export default defineEventHandler(async (event) => {
  const body = await readBody<{ email?: string; password?: string }>(event);
  if (!body?.email || !body?.password) {
    throw createError({ statusCode: 400, statusMessage: "Missing credentials" });
  }

  const directusUrl = config.api.baseUrl;
  const res = await fetch(`${directusUrl}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Nuxt-Auth-Local",
    },
    body: JSON.stringify({
      email: body.email,
      password: body.password,
      mode: "json",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw createError({ statusCode: res.status, statusMessage: err?.errors?.[0]?.message || err?.error?.message || "Login failed" });
  }

  // Proxy Directus response as-is so token pointers work
  const json = await res.json();
  return json;
});


