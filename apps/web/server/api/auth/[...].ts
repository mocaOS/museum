import CredentialsProvider from "next-auth/providers/credentials";
import { JWT } from "next-auth/jwt";
import { Session } from "next-auth";
import { createDirectus, readMe, rest, staticToken } from "@directus/sdk";
import { Directus } from "@local/types";
import config from "@local/config";
import { NuxtAuthHandler } from "#auth";

interface CustomUser extends Partial<Directus.DirectusUsers> {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  access_token: string;
  refresh_token: string;
  expires: number;
  first_name?: string;
  last_name?: string;
}

interface ExtendedJWT extends JWT {
  access_token?: string;
  refresh_token?: string;
  accessTokenExpires?: number;
  first_name?: string;
  last_name?: string;
  ethereum_address?: string | null;
  error?: string;
}

interface ExtendedSession extends Session {
  access_token?: string;
  error?: string;
}

function createDirectusClient(token: string) {
  const directusUrl = config.api.baseUrl;
  return createDirectus<Directus.CustomDirectusTypes>(directusUrl)
    .with(staticToken(token))
    .with(rest());
}

async function refreshAccessToken({ _accessToken, _accessTokenExpires, refreshToken }: {
  _accessToken: string;
  _accessTokenExpires: number;
  refreshToken: string;
}): Promise<ExtendedJWT> {
  try {
    const directusUrl = config.api.baseUrl;

    const refreshedTokens = await fetch(`${directusUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        mode: "json",
      }),
    }).then(async (r) => {
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({ message: "Unknown error" }));
        throw new Error(`Failed to refresh token: ${errorData.message || r.statusText}`);
      }
      return r.json();
    });

    if (!refreshedTokens || !refreshedTokens.data) {
      throw new Error("Failed to refresh tokens: No data returned");
    }

    return {
      accessToken: refreshedTokens.data.access_token,
      refreshToken: refreshedTokens.data.refresh_token,
      accessTokenExpires: Date.now() + refreshedTokens.data.expires,
    } as ExtendedJWT;
  } catch (_error) {
    return { error: "RefreshAccessTokenError" } as ExtendedJWT;
  }
}

export default NuxtAuthHandler({
  secret: useRuntimeConfig().authSecret,
  providers: [
    // @ts-expect-error Use .default here for it to work during SSR
    CredentialsProvider.default({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any) {
        try {
          if (!credentials?.email || !credentials?.password) return null;

          const directusUrl = config.api.baseUrl;

          const loginResponse = await fetch(`${directusUrl}/auth/login`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "Nuxt-Auth-Directus",
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          });

          if (!loginResponse.ok) return null;

          const authData = await loginResponse.json();

          const userResponse = await fetch(`${directusUrl}/users/me`, {
            headers: {
              Authorization: `Bearer ${authData.data.access_token}`,
            },
          });

          if (!userResponse.ok) return null;

          const userData = await userResponse.json();

          const directus = createDirectusClient(authData.data.access_token);
          const directusUserData = await directus.request(readMe({
            fields: [ "first_name", "last_name", "email", "role" ],
          }));

          return {
            id: userData.data.id,
            name: `${userData.data.first_name} ${userData.data.last_name || ""}`,
            email: userData.data.email,
            ethereum_address: userData.data.ethereum_address,
            image: userData.data.avatar?.id
              ? `${directusUrl}/assets/${userData.data.avatar.id}`
              : null,
            access_token: authData.data.access_token,
            refresh_token: authData.data.refresh_token,
            expires: authData.data.expires,
            first_name: directusUserData.first_name,
            last_name: directusUserData.last_name,
          } as CustomUser;
        } catch (_error) {
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async redirect({ url, baseUrl }: { url: string; baseUrl: string }) {
      if (!url || typeof url !== "string" || url.trim() === "") return baseUrl;
      if (url.startsWith("/")) return url;
      try {
        const urlObj = new URL(url);
        if (urlObj.origin === baseUrl) return url;
      } catch {
        return baseUrl;
      }
      return baseUrl;
    },

    async jwt({ token, user }: { token: JWT; user?: CustomUser | null }): Promise<ExtendedJWT> {
      if (user) {
        const customUser = user as CustomUser;
        token.access_token = customUser.access_token;
        token.refresh_token = customUser.refresh_token;
        token.accessTokenExpires = Date.now() + (customUser.expires || 900000);
        token.first_name = customUser.first_name;
        token.last_name = customUser.last_name;
        (token as ExtendedJWT).ethereum_address = (customUser as any).ethereum_address ?? null;
      }

      const REFRESH_BUFFER_TIME = 5 * 60 * 1000;
      if (token.accessTokenExpires
          && Date.now() < (token.accessTokenExpires as number) - REFRESH_BUFFER_TIME) {
        return token as ExtendedJWT;
      }

      if (token.refresh_token) {
        const refreshedToken = await refreshAccessToken({
          _accessToken: token.access_token as string,
          _accessTokenExpires: token.accessTokenExpires as number,
          refreshToken: token.refresh_token as string,
        });

        if ("error" in refreshedToken && refreshedToken.error) {
          return { ...token, error: refreshedToken.error } as ExtendedJWT;
        }

        return {
          ...token,
          access_token: refreshedToken.accessToken,
          refresh_token: refreshedToken.refreshToken,
          accessTokenExpires: refreshedToken.accessTokenExpires,
        } as ExtendedJWT;
      }

      return token as ExtendedJWT;
    },

    async session({ session, token }: { session: Session; token: JWT }) {
      const extendedSession = session as ExtendedSession;
      if (token) {
        if (!extendedSession.user) {
          extendedSession.user = { id: token.sub as string } as any;
        } else {
          (extendedSession.user as any).id = token.sub as string;
        }
        extendedSession.access_token = token.access_token as string;
        extendedSession.error = token.error as string | undefined;

        if (extendedSession.user) {
          (extendedSession.user as any).ethereum_address = (token as ExtendedJWT).ethereum_address ?? null;
        }

        if (token.error) return extendedSession;

        if (token.access_token) {
          try {
            if (token.accessTokenExpires && Date.now() > (token.accessTokenExpires as number)) {
              return extendedSession;
            }
            const directus = createDirectusClient(token.access_token as string);
            const directusUserData = await directus.request(readMe({
              fields: [ "first_name", "last_name", "email", "role", "ethereum_address" ],
            }));

            if (extendedSession.user) {
              (extendedSession.user as any).first_name = directusUserData.first_name;
              (extendedSession.user as any).last_name = directusUserData.last_name;
              extendedSession.user.name = `${directusUserData.first_name || ""} ${directusUserData.last_name || ""}`.trim();
              extendedSession.user.email = directusUserData.email;
              (extendedSession.user as any).role = directusUserData.role;
              (extendedSession.user as any).ethereum_address = directusUserData.ethereum_address ?? (extendedSession.user as any).ethereum_address ?? null;
            }
          } catch {}
        }
      }
      return extendedSession;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
