<template>
  <Dialog @update:open="updateOpen" :open="isOpen">
    <DialogContent
      @open-auto-focus="onOpenAutoFocus"
      class="bg-background group size-full max-w-full overflow-hidden border-none p-0 text-foreground outline-hidden focus:ring-0"
    >
      <VisuallyHidden>
        <DialogTitle>
          {{ nft?.name || 'Artwork Title' }}
        </DialogTitle>
        <DialogDescription>
          by {{ nft?.artist_name || 'Author Name' }}
        </DialogDescription>
      </VisuallyHidden>

      <div class="relative">
        <!-- Artwork Image -->
        <div
          class="relative flex h-[calc(100vh-5rem)] w-full items-center justify-center pt-16"
        >
          <Button
            @click="navigatePrevious"
            v-if="hasPrevious"
            variant="ghost"
            size="icon"
            class="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-6 opacity-0 transition-all duration-300 group-hover:opacity-100"
          >
            <ChevronLeft class="size-4" />
          </Button>

          <Button
            @click="navigateNext"
            v-if="hasNext"
            variant="ghost"
            size="icon"
            class="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full p-6 opacity-0 transition-all duration-300 group-hover:opacity-100"
          >
            <ChevronRight class="size-4" />
          </Button>

          <MOCAMedia
            @click="!isModel && updateOpen(false)"
            v-if="nft && (nft.display_animation_info || nft.display_media_info || nft.media_info)"
            :key="nft?.id"
            :media-info="nft.display_animation_info || nft.display_media_info || nft.media_info"
            :height="800"
            contain
            :show-loader="true"
            :video-controls="true"
            class="max-h-full max-w-full"
          />
        </div>

        <!-- Artwork Info -->
        <div class="flex items-center p-4">
          <div class="w-full text-center">
            <h2 class="text-xl line-clamp-1">
              {{ nft?.name || 'Artwork Title' }}
            </h2>
            <p v-if="nft?.artist_name" class="text-sm text-muted-foreground">
              by {{ nft?.artist_name }}
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import type { Directus } from "@local/types";
import { VisuallyHidden } from "radix-vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, watch } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  nft: Directus.Nfts | null;
  isOpen: boolean;
  nfts?: Directus.Nfts[];
  currentIndex?: number;
}>();

const emit = defineEmits<{
  "update:isOpen": [value: boolean];
  "navigate": [nft: Directus.Nfts];
}>();

const hasNext = computed(() => {
  if (!props.nfts || props.currentIndex === undefined) return false;
  return props.currentIndex < props.nfts.length - 1;
});

const hasPrevious = computed(() => {
  if (!props.nfts || props.currentIndex === undefined) return false;
  return props.currentIndex > 0;
});

const isModel = computed(() => {
  if (!props.nft) return false;

  // Check if any of the media info objects have type 'model'
  const media = props.nft.display_animation_info || props.nft.display_media_info || props.nft.media_info;
  if (!media) return false;

  // Use type assertion since we know the structure but TypeScript sees it as unknown
  return (media as { type?: string })?.type === "model";
});

function updateOpen(value: boolean) {
  emit("update:isOpen", value);
}

function navigateNext() {
  if (!hasNext.value || !props.nfts || props.currentIndex === undefined) return;
  emit("navigate", props.nfts[props.currentIndex + 1]);
}

function navigatePrevious() {
  if (!hasPrevious.value || !props.nfts || props.currentIndex === undefined) return;
  emit("navigate", props.nfts[props.currentIndex - 1]);
}

function handleKeyDown(event: KeyboardEvent) {
  if (!props.isOpen) return;

  if (event.key === "ArrowRight") {
    navigateNext();
  } else if (event.key === "ArrowLeft") {
    navigatePrevious();
  }
}

// Set up global keyboard event listener
watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    document.addEventListener("keydown", handleKeyDown);
  } else {
    document.removeEventListener("keydown", handleKeyDown);
  }
});

// Add event listener when component is mounted
onMounted(() => {
  if (props.isOpen) {
    document.addEventListener("keydown", handleKeyDown);
  }
});

// Remove event listener when component is unmounted
onUnmounted(() => {
  document.removeEventListener("keydown", handleKeyDown);
});

// Prevent auto-focus on modal open
function onOpenAutoFocus(event: Event) {
  event.preventDefault();
}
</script>
