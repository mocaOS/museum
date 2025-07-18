<template>
  <div class="group relative w-full overflow-hidden rounded-md border">
    <div class="flex min-h-20 items-center justify-center relative z-10">
      <MOCAMedia
        @click="$emit('view')"
        :key="nft.id"
        class="cursor-pointer"
        :width="400"
        :media-info="nft.display_animation_info || nft.display_media_info || nft.media_info"
        :cover="true"
        :show-loader="true"
        :lazy="true"
      />
      <div class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-4  opacity-0 transition-opacity duration-300 hover:opacity-100">
        <div class="font-medium">
          {{ nft.name }}
        </div>
      </div>
    </div>
    <div class="absolute inset-x-0 bottom-0 translate-y-full border-t bg-background transition-transform duration-300 group-hover:translate-y-0 z-20">
      <div class="grid grid-cols-[1fr_4rem] gap-2">
        <div class="truncate px-4 py-3">
          <div class="truncate">
            {{ nft.name || 'Artwork Title' }}
          </div>
          <p class="truncate text-sm text-gray-400">
            by {{ nft.artist_name || 'Artist' }}
          </p>
        </div>
        <div
          @click="$emit('view')"
          class="flex h-full w-16 cursor-pointer items-center justify-center  hover:scale-110"
        >
          <Icon name="moca:zoom" class="size-4" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Nfts } from "@local/types/directus";

// Props
defineProps<{
  nft: Nfts;
}>();

// Emits
defineEmits<{
  (e: "view"): void;
}>();
</script>
