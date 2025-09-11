<template>
  <div class="container mt-10">
    <div
      class="
        mx-auto max-w-[980px] space-y-8 rounded-xl border border-border
        bg-background p-4
        sm:rounded-3xl sm:p-10
      "
    >
      <div class="flex items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-semibold">
            Decc0s
          </h1>
        </div>
        <div
          v-if="address"
          class="truncate font-mono text-xs text-muted-foreground"
        >
          {{ address }}
        </div>
      </div>

      <div
        v-if="!address"
        class="text-sm text-muted-foreground"
      >
        Could not detect your wallet address. Please re-login.
      </div>

      <div v-else>
        <div
          v-if="isLoading"
          class="text-sm text-muted-foreground"
        >
          Loading your tokens…
        </div>
        <div
          v-else-if="error"
          class="text-sm text-red-500"
        >
          {{ (error as any)?.message || 'Failed to load tokens' }}
        </div>
        <div v-else>
          <div
            v-if="tokens.length === 0"
            class="text-sm text-muted-foreground"
          >
            No tokens found for this address.
          </div>
          <div
            v-else
            class="
              grid grid-cols-2 gap-4
              sm:grid-cols-3
              md:grid-cols-4
            "
          >
            <div
              @click="startAgent(t.tokenId)"
              v-for="t in tokens"
              :key="t.id || t.tokenId"
              class="relative rounded-md border"
            >
              <GlowingEffect
                :spread="40"
                :glow="true"
                :disabled="false"
                :proximity="64"
                :inactive-zone="0.01"
              />
              <div
                class="
                  cursor-pointer overflow-hidden rounded-md border
                  border-border/50
                "
              >
                <div
                  class="
                    flex aspect-square items-center justify-center bg-muted/20
                  "
                >
                  <NuxtImg
                    provider="mediaproxy"
                    :src="ipfsGateway + (t.image || 'QmTZkKv1f3kZL5BweAP8jipaQH9A15xoCm8iYT3P8wf3Lv')"
                    height="215"
                    width="215"
                    :alt="`Art DeCC0 #${t.tokenId}`"
                    :class="cn(
                      'rounded transition-colors',
                      t.revealed ? 'bg-amber-500/10' : '',
                    )"
                  />
                </div>
                <div class="grid grid-cols-[1fr_auto] gap-2 border-t p-2">
                  <div>
                    <div class="truncate text-sm font-medium">
                      #{{ t.tokenId }}
                    </div>
                    <div class="truncate text-xs text-muted-foreground">
                      {{ t.revealed ? 'Revealed' : 'Not revealed yet' }}
                    </div>
                  </div>
                  <div class="flex items-center justify-center">
                    <Icon
                      name="material-symbols:play-circle-outline"
                      class="size-6"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <footer
    class="container mt-12 pb-10 text-center text-sm text-muted-foreground"
  >
    <div class="mx-auto max-w-[610px] leading-6">
      <p class="mb-8 underline decoration-foreground/20">
        <a href="https://museumofcryptoart.com/" target="_blank">
          © {{ new Date().getFullYear() }}, Museum of Crypto Art
        </a>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Directus } from "@local/types";
import { cn } from "~/lib/utils";

useHead({ title: "Decc0s" });
definePageMeta({
  middleware: [ "auth" ],
});

const { data: authSession } = useAuth();

const address = computed(() => {
  return (authSession.value?.user as Directus.DirectusUsers).ethereum_address;
});

const runtimeConfig = useRuntimeConfig();
const ipfsGateway = computed(() => String((runtimeConfig.public as any)?.ipfs?.gateway || "https://ipfs.qwellcode.de/ipfs/"));
const { directus } = useDirectus();

interface OwnedToken {
  id: string;
  tokenId: string;
  image?: string | null;
  revealed: boolean;
}

const SUBGRAPH_URL = "https://mainnet-graph.deploy.qwellco.de/subgraphs/name/moca/decc0s";

const queryDocument = `
  query OwnedTokens($owner: Bytes!) {
    tokens(where: { owner: $owner }) {
      id
      tokenId
      owner
      revealed
      traits_imageURI
    }
  }
`;

async function fetchOwnedTokens(owner: string): Promise<OwnedToken[]> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: queryDocument, variables: { owner } }),
  });
  if (!res.ok) throw new Error(`Graph request failed (${res.status})`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0]?.message || "Graph error");
  const items = (body.data?.tokens || []) as any[];
  return items.map((it) => {
    const id = String(it.id ?? it.tokenId ?? "");
    const tokenId = String(it.tokenId ?? "");
    const image = it.traits_imageURI ?? null;
    const revealed = Boolean(it.revealed);
    return { id, tokenId, image, revealed } as OwnedToken;
  });
}

const { data, isLoading, error, suspense } = useQuery<OwnedToken[]>({
  queryKey: [ "decc0s-owned", address ],
  enabled: computed(() => !!address.value),
  queryFn: async () => fetchOwnedTokens(address.value as string),
});

await suspense();

const tokens = computed(() => {
  const arr = data.value ?? [];
  return arr.slice().sort((a, b) => Number(b.revealed) - Number(a.revealed));
});

async function startAgent(tokenId: string) {
  try {
    await directus.request(() => ({
      method: "POST",
      path: `/agents/${encodeURIComponent(tokenId)}/start`,
    } as any));
  } catch (error) {
    console.error("Failed to start agent:", error);
  }
}
</script>
