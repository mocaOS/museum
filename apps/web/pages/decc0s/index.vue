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
        <div v-if="directusUserId" class="flex items-center gap-2">
          <Icon
            :name="iconForStatus(appStatus)"
            :class="cn('h-5 w-5', iconClassForStatus(appStatus))"
          />
          <Button
            @click="onToggleStartStopHeader"
            size="sm"
            class="w-28"
            :disabled="appStatus === 'starting' || (appStatus !== 'online' && selectedTokenIdsArray.length === 0)"
          >
            <span
              v-if="appStatus === 'starting'"
              class="inline-flex items-center gap-1"
            >
              <Icon
                name="line-md:loading-twotone-loop"
                class="h-4 w-4"
              />
              Starting
            </span>
            <span v-else>{{ headerButtonLabel }}</span>
          </Button>
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
              @click="toggleSelected(t.tokenId)"
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
                      :name="isTokenSelected(t.tokenId) ? 'material-symbols:check-box' : 'material-symbols:check-box-outline-blank'"
                      :class="cn(
                        'size-6',
                        isTokenSelected(t.tokenId)
                          ? 'text-emerald-500'
                          : 'text-muted-foreground',
                      )"
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
import type { Applications } from "@local/types/directus";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";

definePageMeta({
  middleware: [ "auth" ],
});

interface OwnedToken {
  id: string;
  tokenId: string;
  image?: string | null;
  revealed: boolean;
}

type AgentStatus = "online" | "offline" | "starting";

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

const { session } = useUserSession();
const runtimeConfig = useRuntimeConfig();
const { directus } = useDirectus();
const selectedTokenIds = ref<Set<string>>(new Set());
const initializedFromApp = ref(false);

const directusUserId = computed(() => (session.value as any)?.user?.id || null);
const address = computed(() => (session.value as any)?.user?.ethereum_address);
const ipfsGateway = computed(() => String((runtimeConfig.public as any)?.ipfs?.gateway || "https://ipfs.qwellcode.de/ipfs/"));
const directusBaseUrl = computed(() => String((runtimeConfig.public as any)?.api?.baseUrl || "http://localhost:8055"));

const { data, isLoading, error, suspense: suspenseOwnedTokens } = useQuery<OwnedToken[]>({
  queryKey: [ "decc0s-owned", address ],
  enabled: computed(() => !!address.value),
  queryFn: async () => fetchOwnedTokens(address.value as string),
});

await suspenseOwnedTokens();

const { data: applicationsData, refetch: refetchApplications, suspense: suspenseApplications } = useQuery<Applications[]>({
  queryKey: [ "decc0s-header-applications", directusUserId ],
  enabled: computed(() => !!directusUserId.value),
  queryFn: async () => {
    const { readItems } = await import("@directus/sdk");
    const response = await directus.request((readItems as any)("applications", {
      fields: [ "id", "status", "decc0s", { owner: [ "id" ] } ],
      filter: { owner: { _eq: directusUserId.value } },
      limit: 1,
    }));
    return response as Applications[];
  },
  refetchInterval: 10_000,
  refetchIntervalInBackground: true,
});

await suspenseApplications();

const tokens = computed(() => {
  const arr = data.value ?? [];
  return arr.slice().sort((a, b) => Number(b.revealed) - Number(a.revealed));
});
const tokenIds = computed(() => (tokens.value || []).map(t => t.tokenId));
const application = computed(() => (applicationsData.value && applicationsData.value[0]) || null);
const appStatus = computed<AgentStatus>(() => {
  const s = String((application.value as any)?.status || "offline").toLowerCase();
  return (s === "online" || s === "starting") ? (s as AgentStatus) : "offline";
});
const applicationTokenIds = computed<string[]>(() => {
  const decc0 = String((application.value as any)?.decc0s || "");
  return decc0.split(",").map(s => s.trim()).filter(Boolean);
});
const selectedTokenIdsArray = computed<string[]>(() => Array.from(selectedTokenIds.value));
const selectionDiffersFromApp = computed<boolean>(() => {
  if (!application.value) return false;
  return !arraysEqualAsSets(selectedTokenIdsArray.value, applicationTokenIds.value);
});
const headerButtonLabel = computed<string>(() => {
  if (!application.value) return "Start";
  if (selectionDiffersFromApp.value) return "Restart";
  return appStatus.value === "online" ? "Stop" : "Start";
});

watch(applicationTokenIds, (newTokenIds) => {
  if (initializedFromApp.value) return;
  if (newTokenIds.length > 0) {
    selectedTokenIds.value = new Set(newTokenIds);
    initializedFromApp.value = true;
  }
}, { immediate: true });

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

async function postApplicationsStart(tokenIds: string[]) {
  const token = (session.value as any)?.access_token as string | undefined;
  await fetch(`${directusBaseUrl.value}/applications/start`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ tokenIds }),
  });
}

async function postApplicationsStop() {
  const token = (session.value as any)?.access_token as string | undefined;
  await fetch(`${directusBaseUrl.value}/applications/stop`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function iconForStatus(status?: AgentStatus) {
  switch (status) {
    case "online":
      return "material-symbols:check-circle-outline";
    case "starting":
      return "line-md:loading-twotone-loop";
    case "offline":
    default:
      return "material-symbols:play-circle-outline";
  }
}

function iconClassForStatus(status?: AgentStatus) {
  switch (status) {
    case "online":
      return "text-emerald-500";
    case "starting":
      return "text-amber-500";
    case "offline":
    default:
      return "";
  }
}

function isTokenSelected(id: string): boolean {
  return selectedTokenIds.value.has(String(id));
}

function toggleSelected(id: string) {
  const key = String(id);
  const next = new Set(selectedTokenIds.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  selectedTokenIds.value = next;
}

function arraysEqualAsSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  for (const id of b) if (!set.has(id)) return false;
  return true;
}

async function onToggleStartStopHeader() {
  const selected = selectedTokenIdsArray.value;
  const firstTokenId = (selected && selected[0]) ? String(selected[0]) : ((tokenIds.value && tokenIds.value[0]) ? String(tokenIds.value[0]) : "");
  if (!firstTokenId) return;
  try {
    if (appStatus.value === "online") {
      if (selectionDiffersFromApp.value) {
        await postApplicationsStart(selected.length ? selected : [ firstTokenId ]);
      } else {
        await postApplicationsStop();
      }
      await refetchApplications();
    } else if (appStatus.value === "offline") {
      await postApplicationsStart(selected.length ? selected : [ firstTokenId ]);
      await refetchApplications();
    } else if (appStatus.value === "starting" && selectionDiffersFromApp.value) {
      await postApplicationsStart(selected.length ? selected : [ firstTokenId ]);
      await refetchApplications();
    }
  } catch (e) {
    console.error(e);
  }
}

useHead({ title: "Decc0s" });
</script>
