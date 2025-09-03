<template>
  <div class="container mt-24 pb-32">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-4xl font-semibold">
        {{ collection.title || collection.name }}
      </h1>
      <p
        v-if="collection.description"
        class="mt-2 text-lg text-muted-foreground"
      >
        {{ collection.description }}
      </p>
    </div>

    <!-- Filter and Search Bar -->
    <div class="mb-6 flex flex-wrap items-center gap-5">
      <div
        class="flex h-9 items-center gap-2 rounded-lg border px-7 py-6"
      >
        <span>{{ totalNfts }} NFTs</span>
      </div>

      <Select
        v-if="collectionOptions.length > 0"
        v-model="selectedCollectionSlug"
      >
        <SelectTrigger class="min-w-[220px] py-6">
          <SelectValue placeholder="Select Collection" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            All Collections
          </SelectItem>
          <SelectItem
            v-for="option in collectionOptions"
            :key="option.slug"
            :value="option.slug"
          >
            {{ option.name }}
          </SelectItem>
        </SelectContent>
      </Select>

      <div class="relative w-full max-w-sm">
        <Input
          @trailing-icon-click="inputSearchQuery = ''"
          v-model="inputSearchQuery"
          placeholder="Search by Artist or Title"
          class="w-full max-w-sm py-6"
          leading-icon="moca:search"
          :trailing-icon="inputSearchQuery ? 'moca:close' : undefined"
          :loading="nfts === undefined && searchQuery !== ''"
        />
      </div>

      <Sheet v-if="collection.essay">
        <SheetTrigger as-child>
          <Button
            variant="secondary"
            size="lg"
            class="px-10 py-6"
          >
            Essay
          </Button>
        </SheetTrigger>
        <SheetContent
          class="
            overflow-x-hidden overflow-y-auto text-white
            sm:max-w-md
          "
        >
          <div
            class="
              p-4 markdown-content
              sm:p-6
            "
            v-html="renderedEssay"
          />
        </SheetContent>
      </Sheet>
    </div>

    <!-- Search results indicator -->
    <div v-if="searchQuery" class="mb-6 text-sm text-gray-600">
      Showing results for "{{ searchQuery }}" ({{ totalNfts }} found)
    </div>

    <!-- NFT Grid -->
    <MasonryWall
      @redraw="handleMasonryRedraw"
      v-if="nfts?.length"
      :key="nfts.length"
      :items="nfts"
      :column-width="300"
      :gap="24"
      :ssr-columns="4"
      :min-columns="1"
      :max-columns="4"
    >
      <template #default="{ item }">
        <NftCard
          @view="openNftModal(item)"
          v-if="item && (item.display_media_info || item.media_info)"
          :nft="item"
        />
      </template>
    </MasonryWall>

    <!-- Skeleton Loader -->
    <MasonryWall
      v-else-if="isLoading"
      key="skeleton"
      :items="skeletonItems"
      :column-width="300"
      :gap="24"
      :ssr-columns="4"
      :min-columns="1"
      :max-columns="4"
    >
      <template #default="{ item }">
        <div class="flex flex-col gap-4 overflow-hidden rounded-lg border">
          <Skeleton :style="{ height: `${item.height}px` }" class="w-full" />
          <div class="p-4">
            <Skeleton class="mb-2 h-5 w-3/4" />
            <Skeleton class="h-4 w-1/2" />
          </div>
        </div>
      </template>
    </MasonryWall>

    <div
      v-else-if="searchQuery && totalNfts === 0"
      class="py-8 text-center text-muted-foreground"
    >
      No artworks matching "{{ searchQuery }}" were found. Try a different search term.
    </div>
    <div v-else class="py-8 text-center text-muted-foreground">
      Loading artworks...
    </div>

    <!-- NFT Modal -->
    <NftModal
      @update:is-open="isModalOpen = $event"
      @navigate="navigateToNft"
      :nft="selectedNft"
      :is-open="isModalOpen"
      :nfts="nfts"
      :current-index="selectedNftIndex"
    />

    <!-- Pagination -->
    <div class="mt-8 flex justify-center">
      <Pagination
        @update:page="currentPage = $event"
        v-slot="{ page }"
        :total="+totalNfts"
        :items-per-page="ITEMS_PER_PAGE"
        :sibling-count="1"
        show-edges
      >
        <PaginationContent v-slot="{ items }" class="flex items-center gap-1">
          <PaginationFirst />
          <PaginationPrevious />

          <template v-for="(item, index) in items">
            <PaginationItem
              v-if="item.type === 'page'"
              :key="index"
              :value="item.value"
              as-child
            >
              <Button
                class="size-10 p-0"
                :variant="item.value === page ? 'default' : 'outline'"
              >
                {{ item.value }}
              </Button>
            </PaginationItem>
            <PaginationEllipsis v-else :key="item.type" :index="index" />
          </template>

          <PaginationNext />
          <PaginationLast />
        </PaginationContent>
      </Pagination>
    </div>

    <DevOnly>
      <ChatInterface />
    </DevOnly>
  </div>
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Collections, CustomDirectusTypes, Nfts } from "@local/types/directus";
import { aggregate } from "@directus/sdk";
import { useRoute, useRouter } from "vue-router";
import MarkdownIt from "markdown-it";
import { useSearch } from "../composables/useSearch";
import { usePagination } from "../composables/usePagination";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLast,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const ITEMS_PER_PAGE = 25;

const route = useRoute();
const router = useRouter();

const { directus } = useDirectus();

const {
  inputSearchQuery,
  searchQuery,
  debouncedSearch,
} = useSearch(route.query.search as string || "");

const {
  currentPage,
  updatePage,
} = usePagination(
  route.query.page ? Number.parseInt(route.query.page as string) : 1,
);

const isModalOpen = ref(false);
const selectedNft = ref<Nfts | null>(null);
const selectedNftIndex = ref<number>(-1);

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// Configure markdown-it to open links in new tabs
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  // Add target="_blank" and rel="noopener noreferrer" to all links
  tokens[idx].attrPush([ "target", "_blank" ]);
  tokens[idx].attrPush([ "rel", "noopener noreferrer" ]);

  return defaultRender(tokens, idx, options, env, self);
};

type CollectionSummary = Pick<Collections, "name" | "title" | "description" | "essay" | "slug"> & {
  child_collections: Array<Pick<Collections, "name" | "slug">>;
};

const { data: collection, suspense: suspenseCollection } = useQuery<CollectionSummary>({
  queryKey: [ "collection", route.params.collection || "the-genesis-collection" ],
  queryFn: async () => {
    const { readItems } = await import("@directus/sdk");
    const response = await directus.request(readItems("collections", {
      fields: [
        "name",
        "title",
        "description",
        "essay",
        "slug",
        {
          child_collections: [ "name", "slug" ],
        },
      ],
      filter: {
        _and: [
          {
            status: {
              _eq: "published",
            },
          },
          {
            slug: {
              _eq: route.params.collection as string || "the-genesis-collection",
            },
          },
        ],
      },
    }));

    return response?.[0];
  },
});

await suspenseCollection();

const selectedCollectionSlug = ref("all");

const allCollectionSlugs = computed(() => {
  return [
    collection.value?.slug || "the-genesis-collection",
    ...(collection.value?.child_collections?.map(c => c.slug) || []),
  ];
});

const collectionOptions = computed(() => {
  if (!collection.value) return [];

  return (collection.value.child_collections || []).map(col => ({
    slug: col.slug,
    name: col.name,
  }));
});

const filter = computed(() => {
  const baseFilter = {
    _and: [
      {
        collection_type: {
          slug: {
            _in: selectedCollectionSlug.value === "all"
              ? allCollectionSlugs.value
              : [ selectedCollectionSlug.value ],
          },
        },
      },
      {
        media_info: {
          _null: false,
        },
      },
      {
        display_media_info: {
          _null: false,
        },
      },
    ],
  };

  return baseFilter;
});

const searchFilter = computed(() => {
  if (!searchQuery.value.trim()) return filter.value;

  return {
    _and: [
      ...filter.value._and,
      {
        _or: [
          {
            name: {
              _icontains: searchQuery.value.trim(),
            },
          },
          {
            artist_name: {
              _icontains: searchQuery.value.trim(),
            },
          },
        ],
      },
    ],
  };
});

const { data: totalNftsResponse, suspense: suspenseTotalNfts } = useQuery<{ count: number }[]>({
  queryKey: [ `${route.params.collection || "the-genesis-collection"}-count`, searchQuery, selectedCollectionSlug ],
  queryFn: async () => {
    const result = await directus.request(
      aggregate("nfts", {
        aggregate: { count: "*" },
        query: {
          filter: searchFilter.value,
        },
      }),
    );

    return result as { count: number }[];
  },
});

await suspenseTotalNfts();
const totalNfts = computed(() => totalNftsResponse.value?.[0]?.count || 0);

const { data: nfts, suspense: suspenseNfts, isPending: isLoading } = useQuery<Nfts[]>({
  queryKey: [ `${route.params.collection || "the-genesis-collection"}`, currentPage, searchQuery, selectedCollectionSlug ],
  enabled: !!totalNfts,
  queryFn: async () => {
    const { readItems } = await import("@directus/sdk");
    const response = await directus.request(readItems("nfts", {
      fields: [
        "id",
        "name",
        "media_info",
        "display_media_info",
        "display_animation_info",
        "response_opensea",
        "artist_name",
        "collection",
      ],
      filter: searchFilter.value as any,
      limit: ITEMS_PER_PAGE,
      offset: (currentPage.value - 1) * ITEMS_PER_PAGE,
    }));

    return response;
  },
});

await suspenseNfts();

const skeletonItems = computed(() => {
  return Array.from({ length: ITEMS_PER_PAGE }, () => ({
    height: Math.floor(Math.random() * 200) + 150, // Random height between 150-350px
  }));
});

watch(inputSearchQuery, (newValue) => {
  debouncedSearch(newValue);
});

watch(selectedCollectionSlug, () => {
  currentPage.value = 1;
  router.push({
    query: {
      ...route.query,
      page: "1",
    },
  });
});

watch(currentPage, (newPage) => {
  router.push({
    query: {
      ...route.query,
      page: newPage.toString(),
    },
  });
});

watch(() => route.query.page, (newPage) => {
  if (newPage && Number.parseInt(newPage as string) !== currentPage.value) {
    currentPage.value = Number.parseInt(newPage as string);
  }
});

watch(searchQuery, (newQuery) => {
  currentPage.value = 1;
  router.push({
    query: {
      ...route.query,
      search: newQuery || undefined,
      page: "1",
    },
  });
});

// onMounted(async () => {
//   const result = await client.retrieval.rag({
//     query: "What is a DeCC0?",
//   });

//   console.log(result);
// });

function openNftModal(nft: Nfts) {
  selectedNft.value = nft;
  selectedNftIndex.value = nfts.value?.findIndex(item => item.id === nft.id) ?? -1;
  isModalOpen.value = true;
}

function navigateToNft(nft: Nfts) {
  selectedNft.value = nft;
  selectedNftIndex.value = nfts.value?.findIndex(item => item.id === nft.id) ?? -1;
}

function handleMasonryRedraw() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

const renderedEssay = computed(() => {
  return collection.value?.essay ? md.render(collection.value.essay) : "";
});

useHead({
  title: collection.value?.title,
});
</script>

<style scoped>
.markdown-content {
  color: white;
}

.light .markdown-content {
  color: #111827;
}

.markdown-content :deep(h1) {
  font-size: 1.8rem;
  font-weight: 600;
  margin-bottom: 1rem;
  margin-top: 1.5rem;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  margin-top: 1.25rem;
}

.markdown-content :deep(h3) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  margin-top: 1rem;
}

.markdown-content :deep(h4) {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  margin-top: 1rem;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
  line-height: 1.6;
}

.markdown-content :deep(ul), .markdown-content :deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-content :deep(li) {
  margin-bottom: 0.5rem;
}

.markdown-content :deep(a) {
  color: #ffffff;
}

.light .markdown-content :deep(a) {
  color: #000000;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid #6b7280;
  padding-left: 1rem;
  font-style: italic;
  margin: 1rem 0;
}

.markdown-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.light .markdown-content :deep(code) {
  background-color: rgba(0, 0, 0, 0.1);
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1rem 0;
}

.light .markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.05);
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-content :deep(hr) {
  border: 0;
  border-top: 1px solid #4b5563;
  margin: 1.5rem 0;
}

.light .markdown-content :deep(hr) {
  border-top: 1px solid #d1d5db;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.25rem;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
}

.markdown-content :deep(th), .markdown-content :deep(td) {
  border: 1px solid #4b5563;
  padding: 0.5rem;
}

.light .markdown-content :deep(th), .light .markdown-content :deep(td) {
  border: 1px solid #d1d5db;
}

.markdown-content :deep(th) {
  background-color: rgba(255, 255, 255, 0.1);
}

.light .markdown-content :deep(th) {
  background-color: rgba(0, 0, 0, 0.05);
}
</style>
