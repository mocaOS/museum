import config from "@local/config";
import { clearUserSession, getUserSession } from "#imports";

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  const accessToken = (session as any)?.access_token as string | undefined;
  const refreshToken = (session as any)?.refresh_token as string | undefined;
  const directusUrl = config.api.baseUrl;

  if (accessToken || refreshToken) {
    try {
      await fetch(`${directusUrl}/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ mode: "json", refresh_token: refreshToken }),
      });
    } catch {}
  }

  await clearUserSession(event);
  return { ok: true };
});
