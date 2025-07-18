import { type RestClient, createDirectus, rest } from "@directus/sdk";
import type { Directus } from "@local/types";
import { useRuntimeConfig } from "#imports";

let directusInstance: RestClient<Directus.CustomDirectusTypes> | null = null;

export function useRawDirectus() {
  if (!directusInstance) {
    const config = useRuntimeConfig();
    const directusUrl = config.public.directus?.url || "http://localhost:8055";

    directusInstance = createDirectus<RestClient<Directus.CustomDirectusTypes>>(directusUrl)
      .with(rest());
  }

  return directusInstance;
}
