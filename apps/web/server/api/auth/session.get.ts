import config from "@local/config";

export default defineEventHandler(async (event) => {
  const authHeader = getRequestHeader(event, "authorization");
  const directusUrl = config.api.baseUrl;

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }

  const res = await fetch(`${directusUrl}/users/me`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!res.ok) {
    return null;
  }

  const userJson = await res.json();
  const rawToken = authHeader.substring("Bearer ".length);

  // Return a session object compatible with current client expectations
  return {
    user: userJson?.data ?? null,
    access_token: rawToken,
  };
});
