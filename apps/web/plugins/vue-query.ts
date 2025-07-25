import type {
  DehydratedState,
  VueQueryPluginOptions,
} from "@tanstack/vue-query";
import {
  QueryClient,
  VueQueryPlugin,
  dehydrate,
  hydrate,
} from "@tanstack/vue-query";

// Nuxt 3 app aliases
import { defineNuxtPlugin, useState } from "#imports";

export default defineNuxtPlugin((nuxt) => {
  const vueQueryState = useState<DehydratedState | null>("vue-query");

  // Modify your Vue Query global settings here
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchOnMount: "always",
      },
    },
  });
  const options: VueQueryPluginOptions = { queryClient };

  nuxt.vueApp.use(VueQueryPlugin, options);

  if (import.meta.server) {
    nuxt.hooks.hook("app:rendered", () => {
      vueQueryState.value = dehydrate(queryClient);
    });
  }

  if (import.meta.client) {
    nuxt.hooks.hook("app:created", () => {
      hydrate(queryClient, vueQueryState.value);
    });
  }
});
