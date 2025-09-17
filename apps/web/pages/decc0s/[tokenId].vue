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
            Decc0 Agent #{{ tokenId }}
          </h1>
        </div>
        <div>
          <Button
            @click="stopAgent"
            variant="destructive"
            :disabled="isStopping"
          >
            {{ isStopping ? 'Stopping…' : 'Stop' }}
          </Button>
        </div>
      </div>

      <div class="text-sm text-muted-foreground">
        <template v-if="isFetchingUrl">
          Checking agent access…
        </template>
        <template v-else-if="urlError">
          {{ urlError }}
        </template>
        <template v-else-if="agentUrl">
          <div class="flex items-center gap-3">
            <a :href="agentUrl" target="_blank" rel="noopener noreferrer">
              <Button variant="default">
                Open Agent
              </Button>
            </a>
            <span class="text-xs break-all text-muted-foreground">{{ agentUrl }}</span>
          </div>
        </template>
        <template v-else>
          No agent found for this token.
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: [ "auth" ],
});

const route = useRoute();
const tokenId = computed(() => String(route.params.tokenId || ""));

useHead({ title: `Decc0s Agent #${tokenId.value}` });
const { directus } = useDirectus();
const isStopping = ref(false);

// Fetch agent URL via custom endpoint with ownership verification
const isFetchingUrl = ref(false);
const agentUrl = ref<string | null>(null);
const urlError = ref<string | null>(null);

watchEffect(async () => {
  agentUrl.value = null;
  urlError.value = null;
  if (!tokenId.value) return;
  isFetchingUrl.value = true;
  try {
    const resp = await directus.request(() => ({
      method: "GET",
      path: `/agents/${encodeURIComponent(tokenId.value)}/url`,
    } as any));
    const url = (resp as any)?.url || null;
    agentUrl.value = url;
  } catch (e: any) {
    // Normalize error message a bit for UX
    const msg = String(e?.message || "Failed to fetch agent URL");
    urlError.value = msg.includes("403") ? "Ownership not verified for this token." : msg;
  } finally {
    isFetchingUrl.value = false;
  }
});

async function stopAgent() {
  if (isStopping.value) return;
  isStopping.value = true;
  try {
    await directus.request(() => ({
      method: "POST",
      path: `/agents/${encodeURIComponent(tokenId.value)}/stop`,
    } as any));
    await new Promise(resolve => setTimeout(resolve, 5000));
    navigateTo("/decc0s");
  } catch (e) {
    console.error("Failed to stop agent:", e);
  } finally {
    isStopping.value = false;
  }
}
</script>
