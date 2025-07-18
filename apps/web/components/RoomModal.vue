<template>
  <Dialog @update:open="updateOpen" :open="isOpen">
    <DialogContent
      @open-auto-focus="onOpenAutoFocus"
      class="
        group size-full max-w-full overflow-hidden border-none bg-background p-0
        text-foreground outline-hidden
        focus:ring-0
      "
    >
      <VisuallyHidden>
        <DialogTitle>
          {{ room?.title || room?.series || 'Room Title' }}
        </DialogTitle>
        <DialogDescription>
          by {{ room?.architect || 'Architect' }}
        </DialogDescription>
      </VisuallyHidden>

      <!-- Use flexbox layout with full height minus top padding -->
      <div class="flex h-[calc(100vh-2rem)] flex-col pt-8">
        <!-- Room 3D Model - takes remaining space -->
        <div class="relative flex w-full flex-1 items-center justify-center">
          <Button
            @click="navigatePrevious"
            v-if="hasPrevious"
            variant="ghost"
            size="icon"
            class="
              absolute top-1/2 left-4 z-10 -translate-y-1/2 rounded-full p-6
              opacity-0 transition-all duration-300
              group-hover:opacity-100
            "
          >
            <ChevronLeft class="size-4" />
          </Button>

          <Button
            @click="navigateNext"
            v-if="hasNext"
            variant="ghost"
            size="icon"
            class="
              absolute top-1/2 right-4 z-10 -translate-y-1/2 rounded-full p-6
              opacity-0 transition-all duration-300
              group-hover:opacity-100
            "
          >
            <ChevronRight class="size-4" />
          </Button>

          <div class="relative h-full w-full">
            <!-- 3D Model Loading State -->
            <div
              v-if="isModelLoading && room && room.model"
              class="
                absolute inset-0 z-20 flex items-center justify-center
                bg-background
              "
            >
              <video
                autoplay
                loop
                muted
                class="h-1/3 w-1/3 object-contain"
              >
                <source
                  :src="colorMode.value === 'dark' ? '/moca-loading-darkmode.webm' : '/moca-loading-lightmode.webm'"
                  type="video/webm"
                >
                <!-- Fallback for browsers that don't support webm -->
                <div class="flex items-center justify-center">
                  <div
                    class="
                      h-8 w-8 animate-spin rounded-full border-b-2
                      border-primary
                    "
                  />
                </div>
              </video>
            </div>

            <!-- 3D Model -->
            <MOCAModel
              @load="onModelLoad"
              @error="onModelError"
              v-if="room && room.model"
              :key="room?.id"
              :model-url="getModelUrl(room.model)"
              :alt="`3D model of ${room.title || room.series || 'room'}`"
              :auto-rotate="true"
              :auto-rotate-delay="3000"
              environment-image="neutral"
              :exposure="1.2"
              :shadow-intensity="0.8"
            />

            <!-- Fallback Image -->
            <div
              v-else-if="room && room.image"
              class="h-full w-full"
            >
              <NuxtImg
                provider="directus"
                class="h-full w-full object-contain"
                quality="75"
                :src="room.image.toString()"
                :alt="room.title || room.series || 'Room image'"
              />
            </div>

            <!-- No Content State -->
            <div
              v-else
              class="
                flex h-full w-full items-center justify-center bg-muted
                text-muted-foreground
              "
            >
              No 3D model or image available
            </div>
          </div>
        </div>

        <!-- Room Info - auto height based on content -->
        <div class="mx-auto w-full max-w-5xl flex-shrink-0 p-4">
          <div class="w-full text-center">
            <h2 class="line-clamp-1 text-xl">
              {{ room?.title || room?.series || 'Room Title' }}
            </h2>
            <p v-if="room?.architect" class="text-sm text-muted-foreground">
              by {{ room?.architect }}
            </p>
            <p
              v-if="room?.description"
              class="mt-2 text-xs leading-relaxed text-muted-foreground"
            >
              {{ room?.description }}
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import type { Rooms } from "@local/types/directus";
import { VisuallyHidden } from "radix-vue";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, watch } from "vue";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  room: Rooms | null;
  isOpen: boolean;
  rooms?: Rooms[];
  currentIndex?: number;
}>();

const emit = defineEmits<{
  "update:isOpen": [value: boolean];
  "navigate": [room: Rooms];
}>();

const config = useRuntimeConfig();
const colorMode = useColorMode();

// Loading state for 3D model
const isModelLoading = ref(false);

const hasNext = computed(() => {
  if (!props.rooms || props.currentIndex === undefined) return false;
  return props.currentIndex < props.rooms.length - 1;
});

const hasPrevious = computed(() => {
  if (!props.rooms || props.currentIndex === undefined) return false;
  return props.currentIndex > 0;
});

function updateOpen(value: boolean) {
  emit("update:isOpen", value);
}

function navigateNext() {
  if (!hasNext.value || !props.rooms || props.currentIndex === undefined) return;
  emit("navigate", props.rooms[props.currentIndex + 1]);
}

function navigatePrevious() {
  if (!hasPrevious.value || !props.rooms || props.currentIndex === undefined) return;
  emit("navigate", props.rooms[props.currentIndex - 1]);
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

// Watch for room changes to start loading
watch(() => props.room, (newRoom) => {
  if (newRoom && newRoom.model) {
    isModelLoading.value = true;
  }
}, { immediate: true });

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

// Helper function to get model URL
function getModelUrl(model: string | { id: string } | null): string {
  if (!model) return "";

  const modelId = typeof model === "string" ? model : model.id;
  return `${config.public.api.baseUrl}/assets/${modelId}`;
}

function onModelLoad() {
  console.log("3D model loaded successfully");
  isModelLoading.value = false;
}

function onModelError(error: any) {
  console.error("Error loading 3D model:", error);
  isModelLoading.value = false;
}
</script>
