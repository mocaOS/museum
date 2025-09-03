import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { Directus } from "@local/types";
import { useRuntimeConfig } from "#imports";

const connectionHealth = ref<"healthy" | "degraded" | "unhealthy">("healthy");
const lastHealthCheck = ref<number>(0);
const retryAttempts = ref<Map<string, number>>(new Map());

export function useDirectus() {
  const { status, data: session, getSession } = useAuth();
  const config = useRuntimeConfig();

  const shouldRetry = (operationId: string): boolean => {
    const attempts = retryAttempts.value.get(operationId) || 0;
    return attempts < 3;
  };

  const incrementRetry = (operationId: string): void => {
    const current = retryAttempts.value.get(operationId) || 0;
    retryAttempts.value.set(operationId, current + 1);
    setTimeout(() => {
      retryAttempts.value.delete(operationId);
    }, 5 * 60 * 1000);
  };

  const createClient = () => {
    const directusUrl = String(config.public?.api.baseUrl || "http://localhost:8055");

    if (status.value === "authenticated" && session.value) {
      const accessToken = (session.value as any).access_token;
      const error = (session.value as any).error;

      if (accessToken && !error) {
        try {
          const client = createDirectus<Directus.CustomDirectusTypes>(directusUrl)
            .with(staticToken(accessToken))
            .with(rest());

          if (process.client) {
            const originalRequest = client.request.bind(client);
            client.request = async (...args: any[]) => {
              const operationId = `${args[0]?.constructor?.name || "unknown"}_${Date.now()}`;
              try {
                const result = await originalRequest(...args);
                retryAttempts.value.delete(operationId);
                connectionHealth.value = "healthy";
                lastHealthCheck.value = Date.now();
                return result;
              } catch (error: any) {
                if (error?.response?.status === 401) {
                  if (error?.response?.data?.message === "Token expired.") {
                    if (shouldRetry(operationId)) {
                      incrementRetry(operationId);
                      try {
                        await getSession();
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return await originalRequest(...args);
                      } catch {
                        connectionHealth.value = "unhealthy";
                      }
                    }
                  } else {
                    connectionHealth.value = "unhealthy";
                    if (process.client) {
                      await navigateTo("/login");
                    }
                  }
                } else if (error?.response?.status >= 500) {
                  connectionHealth.value = "degraded";
                } else if (error?.code === "NETWORK_ERROR" || !navigator.onLine) {
                  connectionHealth.value = "unhealthy";
                }
                throw error;
              }
            };
          }

          return client;
        } catch (error) {
          connectionHealth.value = "degraded";
        }
      }
    }

    return createDirectus<Directus.CustomDirectusTypes>(String(directusUrl))
      .with(rest());
  };

  const directus = createClient();

  return {
    directus,
    isAuthenticated: computed(() =>
      status.value === "authenticated"
      && session.value
      && !!(session.value as any).access_token
      && !(session.value as any).error,
    ),
    connectionHealth: readonly(connectionHealth),
    lastHealthCheck: readonly(lastHealthCheck),
    async healthCheck(): Promise<boolean> {
      try {
        const client = createDirectus<Directus.CustomDirectusTypes>(
          String(config.public?.api.baseUrl || "http://localhost:8055"),
        ).with(rest());
        await client.request({ method: "GET", path: "/server/ping" } as any);
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
