<template>
  <div class="container mt-24 pb-32">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-semibold">
        ROOMs
      </h1>
      <p class="mt-2 text-lg text-muted-foreground">
        Explore our collection of digital spaces and virtual environments.
      </p>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="flex flex-col items-center justify-center">
      <div class="mt-8 text-center text-muted-foreground">
        <div
          class="
            mx-auto mb-2 h-8 w-8 animate-spin rounded-full border-b-2
            border-primary
          "
        />
        <p class="text-xs">
          Loading Rooms
        </p>
      </div>
    </div>

    <!-- Rooms Content -->
    <div v-else-if="rooms && rooms.length > 0" class="mx-auto w-full space-y-3">
      <div
        class="
          grid grid-cols-1 gap-3
          sm:grid-cols-2
          lg:grid-cols-3
          2xl:grid-cols-4
        "
      >
        <div
          v-for="(room, index) in rooms"
          :key="index"
        >
          <div
            class="relative rounded-lg border"
          >
            <GlowingEffect
              :spread="40"
              :glow="true"
              :disabled="false"
              :proximity="64"
              :inactive-zone="0.01"
            />
            <div
              @click="openRoomModal(room)"
              class="
                block cursor-pointer overflow-hidden rounded-lg border
                border-border/50
              "
            >
              <div class="relative">
                <div
                  class="
                    relative flex h-[26rem] w-full items-center justify-center
                    overflow-hidden bg-background px-4 py-4 shadow-md
                  "
                >
                  <div
                    v-if="room.image"
                    class="
                      absolute inset-0 z-10 overflow-hidden rounded-lg
                      rounded-b-none transition-opacity duration-300
                    "
                  >
                    <div class="relative -z-50 h-full w-full">
                      <NuxtImg
                        provider="directus"
                        loading="lazy"
                        class="h-full w-full object-cover"
                        quality="75"
                        :src="room.image.toString()"
                        :height="256 * 2"
                        :alt="room.title || 'Room image'"
                      />
                    </div>
                  </div>
                  <div
                    v-else
                    class="
                      flex h-full w-full items-center justify-center bg-muted
                      text-muted-foreground
                    "
                  >
                    No Image
                  </div>
                </div>
              </div>
              <div class="relative overflow-hidden border-t border-border p-4">
                <div
                  v-if="room.slots"
                  class="
                    absolute -top-3.5 -right-2 text-8xl font-bold opacity-30
                  "
                >
                  {{ room.slots }}
                </div>
                <h2
                  class="
                    overflow-hidden font-medium text-ellipsis whitespace-nowrap
                  "
                >
                  {{ room.series || 'Untitled Series' }}
                </h2>
                <p
                  class="
                    mt-2 line-clamp-5 block max-h-[5rem] overflow-hidden pr-24
                    text-sm text-ellipsis whitespace-nowrap
                    text-muted-foreground
                  "
                >
                  <template v-if="room.title">
                    {{ room.title }}
                  </template>
                  <template v-else>
                      &nbsp;
                  </template>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else class="flex flex-col items-center justify-center">
      <div class="mt-8 text-center text-muted-foreground">
        <p>No ROOMs found</p>
      </div>
    </div>

    <!-- Room Modal -->
    <RoomModal
      @update:is-open="handleModalOpenChange"
      @navigate="navigateToRoom"
      :room="selectedRoom"
      :is-open="isModalOpen"
      :rooms="rooms"
      :current-index="selectedRoomIndex"
    />
  </div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { CustomDirectusTypes, Rooms } from "@local/types/directus";

const { readItems } = useDirectusItems<CustomDirectusTypes>();
const route = useRoute();
const router = useRouter();

// Modal state
const isModalOpen = ref(false);
const selectedRoom = ref<Rooms | null>(null);
const selectedRoomIndex = ref<number>(-1);

// Fetch rooms data
const { data: rooms, suspense: suspenseRooms, isPending: isLoading } = useQuery<Rooms[]>({
  queryKey: [ "rooms" ],
  queryFn: async () => {
    const response = await readItems("rooms", {
      fields: [
        "id",
        "title",
        "architect",
        "description",
        "series",
        "slots",
        "token_id",
        "image",
        "model",
      ],
      sort: [ "-date_created" ],
    });
    return response;
  },
});

await suspenseRooms();

// Watch for tokenId query parameter changes
watch(() => route.query.tokenId, (tokenId) => {
  if (tokenId && rooms.value) {
    const room = rooms.value.find(room => room.token_id?.toString() === tokenId.toString());
    if (room) {
      openRoomModalInternal(room);
    }
  } else if (!tokenId && isModalOpen.value) {
    closeModal();
  }
}, { immediate: true });

// Modal functions
function openRoomModal(room: Rooms) {
  selectedRoom.value = room;
  selectedRoomIndex.value = rooms.value?.findIndex(item => item.id === room.id) ?? -1;
  isModalOpen.value = true;

  // Update URL with tokenId query parameter
  if (room.token_id) {
    router.push({
      query: {
        ...route.query,
        tokenId: room.token_id.toString(),
      },
    });
  }
}

function openRoomModalInternal(room: Rooms) {
  selectedRoom.value = room;
  selectedRoomIndex.value = rooms.value?.findIndex(item => item.id === room.id) ?? -1;
  isModalOpen.value = true;
}

function closeModal() {
  isModalOpen.value = false;
  selectedRoom.value = null;
  selectedRoomIndex.value = -1;
}

function handleModalOpenChange(isOpen: boolean) {
  if (!isOpen) {
    // Remove tokenId from URL when modal closes
    const newQuery = { ...route.query };
    delete newQuery.tokenId;
    router.push({ query: newQuery });
    closeModal();
  }
}

function navigateToRoom(room: Rooms) {
  selectedRoom.value = room;
  selectedRoomIndex.value = rooms.value?.findIndex(item => item.id === room.id) ?? -1;

  // Update URL with new tokenId
  if (room.token_id) {
    router.push({
      query: {
        ...route.query,
        tokenId: room.token_id.toString(),
      },
    });
  }
}

// SEO
useSeoMeta({
  title: "ROOMs",
  description: "Explore our collection of digital spaces and virtual environments.",
});
</script>
