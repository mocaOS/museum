import { createDirectus, rest, withOptions } from "@directus/sdk";
import type { Directus } from "@local/types";
import { useRuntimeConfig } from "#imports";

const connectionHealth = ref<"healthy" | "degraded" | "unhealthy">("healthy");
const lastHealthCheck = ref<number>(0);
const retryAttempts = ref<Map<string, number>>(new Map());
const currentAccessToken = ref<string | null>(null);
let directusSingleton: any = null;

function shouldRetry(operationId: string): boolean {
  const attempts = retryAttempts.value.get(operationId) || 0;
  return attempts < 3;
}

function incrementRetry(operationId: string): void {
  const current = retryAttempts.value.get(operationId) || 0;
  retryAttempts.value.set(operationId, current + 1);
  setTimeout(() => {
    retryAttempts.value.delete(operationId);
  }, 5 * 60 * 1000);
}

function getOrCreateClient(directusUrl: string) {
  if (directusSingleton) return directusSingleton;

  try {
    const client = createDirectus<Directus.CustomDirectusTypes>(directusUrl)
      .with(rest());

    const originalRequest = client.request.bind(client);

    client.request = async (command: any, options?: any) => {
      const operationId = `${command?.constructor?.name || "unknown"}_${Date.now()}`;

      const token = currentAccessToken.value;
      const requestOptions = {
        ...(options || {}),
        headers: {
          ...(command().headers?.["Content-Type"]?.includes("multipart/form-data") ? {} : { "Content-Type": "application/json" }),
          ...(options?.headers || {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      } as any;

      try {
        const result = await originalRequest(withOptions(command, requestOptions));

        retryAttempts.value.delete(operationId);
        connectionHealth.value = "healthy";
        lastHealthCheck.value = Date.now();
        return result;
      } catch (error: any) {
        const tokenExpired = Boolean(
          error?.errors?.[0]?.extensions?.code === "TOKEN_EXPIRED"
          || (typeof error?.message === "string" && error.message.toLowerCase().includes("token expired")),
        );

        if (error?.response?.status === 401 || tokenExpired) {
          if (shouldRetry(operationId)) {
            incrementRetry(operationId);

            const previousToken = currentAccessToken.value;

            // Attempt to refresh access token via our API, then refetch session
            const refreshResult = await $fetch("/api/auth/refresh", {
              method: "POST",
              credentials: "include",
            }).catch((e): { ok: boolean } | null => {
              // If refresh fails with 400 (missing refresh token) or 401 (invalid/expired), redirect immediately
              if (e?.statusCode === 400 || e?.statusCode === 401) {
                if (process.client && !window.location.pathname.includes("/login")) {
                  connectionHealth.value = "unhealthy";
                  navigateTo("/login?from=directus-no-refresh-token");
                }
              }
              return null;
            });

            // If refresh succeeded, update session and retry the request
            if (refreshResult?.ok) {
              const { fetch: refreshSession } = useUserSession();
              await refreshSession().catch(() => {});

              // Wait briefly for token state to update after refresh
              const startedAt = Date.now();
              while (currentAccessToken.value === previousToken || !currentAccessToken.value) {
                if (Date.now() - startedAt > 2000) break;
                await new Promise(resolve => setTimeout(resolve, 50));
              }

              const retryToken = currentAccessToken.value;
              const retryOptions = {
                ...(options || {}),
                headers: {
                  ...(command().headers?.["Content-Type"]?.includes("multipart/form-data") ? {} : { "Content-Type": "application/json" }),
                  ...(options?.headers || {}),
                  ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
                },
              } as any;

              // Retry the request with new token
              return await originalRequest(withOptions(command, retryOptions));
            }

            // Refresh failed - check if we should retry again or give up
            if (!shouldRetry(operationId)) {
              // Max retries exhausted
              connectionHealth.value = "unhealthy";
              if (process.client && !window.location.pathname.includes("/login")) {
                await navigateTo("/login?from=directus-max-retries");
              }
              throw error;
            }

            // Still have retries left, throw error to let caller retry
            connectionHealth.value = "unhealthy";
            throw error;
          } else {
            // Max retries already exhausted
            connectionHealth.value = "unhealthy";
            if (process.client && !window.location.pathname.includes("/login")) {
              await navigateTo("/login?from=directus-no-retries-left");
            }
            throw error;
          }
        } else if (error?.response?.status >= 500) {
          connectionHealth.value = "degraded";
        } else if (error?.code === "NETWORK_ERROR" || (typeof navigator !== "undefined" && !navigator.onLine)) {
          connectionHealth.value = "unhealthy";
        }
        throw error;
      }
    };

    directusSingleton = client;
    return client;
  } catch (error) {
    connectionHealth.value = "degraded";
  }

  directusSingleton = createDirectus<Directus.CustomDirectusTypes>(String(directusUrl)).with(rest());
  return directusSingleton;
}

export function useDirectus() {
  const { loggedIn, session, fetch } = useUserSession();
  const accessTokenRef = computed<string | null>(() => (session.value as any)?.access_token ?? null);

  const config = useRuntimeConfig();

  // Keep the singleton client's auth header in sync with the current session token
  watch(accessTokenRef, (token) => {
    currentAccessToken.value = token;
  }, { immediate: true });

  const directusUrl = String(config.public?.api.baseUrl || "http://localhost:8055");
  const directus = getOrCreateClient(directusUrl);

  return {
    directus,
    isAuthenticated: computed(() =>
      loggedIn.value && !!accessTokenRef.value,
    ),
    connectionHealth: readonly(connectionHealth),
    lastHealthCheck: readonly(lastHealthCheck),
    async healthCheck(): Promise<boolean> {
      try {
        await directus.request({ method: "GET", path: "/server/ping" } as any);
        connectionHealth.value = "healthy";
        lastHealthCheck.value = Date.now();
        return true;
      } catch {
        connectionHealth.value = "unhealthy";
        lastHealthCheck.value = Date.now();
        return false;
      }
    },
  };
}
