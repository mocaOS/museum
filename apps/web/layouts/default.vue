<template>
  <header class="sticky inset-x-0 top-0 z-50 border-b bg-background">
    <div class="container h-16">
      <div class="grid size-full grid-cols-[1fr_auto_1fr] gap-4">
        <div class="flex items-center gap-4">
          <div class="md:hidden">
            <Popover
              v-model:open="isOpen"
            >
              <PopoverTrigger
                class="
                  group p-4 pl-0
                  focus-visible:outline-hidden
                "
              >
                <div class="group/50 cursor-pointer transition-all">
                  <Icon name="moca:menu" />
                </div>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                class="p-2"
              >
                <div class="space-y-2 text-sm">
                  <NuxtLink
                    @click="isOpen = false"
                    to="/library"
                    class="
                      block rounded-md p-2 opacity-70 transition-colors
                      hover:bg-muted-foreground/20 hover:opacity-100
                    "
                  >
                    Library
                  </NuxtLink>

                  <DevOnly>
                    <NuxtLink
                      @click="isOpen = false"
                      to="/rooms"
                      class="
                        block rounded-md p-2 opacity-70 transition-colors
                        hover:bg-muted-foreground/20 hover:opacity-100
                      "
                    >
                      ROOMs
                    </NuxtLink>
                  </DevOnly>

                  <hr>

                  <NuxtLink
                    @click="isOpen = false"
                    v-if="false"
                    to="/"
                    class="block opacity-70 transition-colors"
                  >
                    Registration
                  </NuxtLink>
                  <NuxtLink
                    v-if="false"
                    class="
                      block cursor-not-allowed opacity-70 transition-colors
                    "
                  >
                    Claim
                  </NuxtLink>
                  <NuxtLink
                    v-if="false"
                    class="
                      block cursor-not-allowed opacity-70 transition-colors
                    "
                  >
                    Bridge
                  </NuxtLink>
                  <NuxtLink
                    @click="isOpen = false"
                    v-if="false"
                    to="/token"
                    class="block opacity-70 transition-colors"
                  >
                    $MOCA Token
                  </NuxtLink>
                  <template
                    v-for="(collection, index) in filteredCollections"
                    :key="collection.id"
                  >
                    <NuxtLink
                      @click="isOpen = false"
                      :to="index === 0 ? '/the-genesis-collection' : `/${collection.slug}`"
                      class="
                        block rounded-md p-2 opacity-70 transition-colors
                        hover:bg-muted-foreground/20 hover:opacity-100
                      "
                    >
                      {{ collection.name }}
                    </NuxtLink>
                  </template>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div
            class="
              -ml-4 hidden
              md:block
            "
          >
            <NavigationMenu>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuLink
                    as-child
                    :class="twMerge(navigationMenuTriggerStyle(), `
                      bg-transparent
                    `)"
                  >
                    <NuxtLink to="/library" class="font-medium">
                      Library
                    </NuxtLink>
                  </NavigationMenuLink>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger class="bg-transparent font-medium">
                    Collections
                  </NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul
                      class="
                        grid w-[400px]
                        md:w-[400px]
                        lg:w-[400px]
                      "
                    >
                      <template
                        v-for="(collection, index) in filteredCollections"
                        :key="collection.id"
                      >
                        <li>
                          <NavigationMenuLink as-child>
                            <NuxtLink
                              :to="index === 0 ? '/the-genesis-collection' : `/${collection.slug}`"
                            >
                              <div class="px-2 py-3 text-sm leading-none">
                                {{ collection.name }}
                              </div>
                              <p
                                v-if="collection.description"
                                class="
                                  line-clamp-2 text-sm leading-snug
                                  text-muted-foreground
                                "
                              >
                                {{ collection.description }}
                              </p>
                            </NuxtLink>
                          </NavigationMenuLink>
                        </li>
                      </template>
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>

                <DevOnly>
                  <NavigationMenuItem>
                    <NavigationMenuLink
                      as-child
                      :class="twMerge(navigationMenuTriggerStyle(), `
                        bg-transparent
                      `)"
                    >
                      <NuxtLink to="/rooms" class="font-medium">
                        ROOMs
                      </NuxtLink>
                    </NavigationMenuLink>
                  </NavigationMenuItem>
                </DevOnly>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
        <div class="flex items-center justify-center">
          <NuxtLink to="/library" class="focus-visible:outline-hidden">
            <Icon name="moca:logo" class="text-4xl" :class="[{ invert: $colorMode.value === 'light' }]" />
          </NuxtLink>
        </div>
        <div class="flex items-center justify-end">
          <ColorMode />
        </div>
      </div>
    </div>
  </header>
  <slot />
</template>

<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import type { Collections, CustomDirectusTypes } from "@local/types/directus";
import { twMerge } from "tailwind-merge";
import ColorMode from "~/components/ColorMode.vue";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "~/components/ui/navigation-menu";

const { readItems } = useDirectusItems<CustomDirectusTypes>();

const isOpen = ref(false);

const { data: collections, suspense: suspenseCollections } = useQuery<Collections[]>({
  queryKey: [ "collections" ],
  queryFn: async () => {
    const response = await readItems("collections", {
      fields: [
        "id",
        "name",
        "slug",
        "parent_collection",
        {
          child_collections: [
            "id",
            "name",
            "slug",
          ],
        },
      ],
      filter: {
        status: {
          _eq: "published",
        },
      },
    });

    return response;
  },
});

await suspenseCollections();

const filteredCollections = computed(() => {
  return collections.value?.filter((collection) => {
    return !collection.parent_collection;
  });
});
</script>
