<template>
  <ClientOnly>
    <div
      @click="handleToggleColorMode"
      :key="colorMode.value"
      class="
        cursor-pointer transition-opacity
        hover:opacity-50
      "
    >
      <Icon v-show="colorMode.value === 'dark'" icon="mi:moon" class="text-2xl" />
      <Icon v-show="colorMode.value === 'light'" icon="mi:sun" class="text-2xl" />
    </div>
    <template #fallback>
      <div>
        <Icon icon="mi:moon" class="text-2xl" />
      </div>
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useAppKitTheme } from "@reown/appkit/vue";

const colorMode = useColorMode();
const appKitTheme = useAppKitTheme();

function handleToggleColorMode() {
  colorMode.preference = colorMode.value === "dark" ? "light" : "dark";
  appKitTheme.setThemeMode(colorMode.value === "light" ? "dark" : "light");
}
</script>

<style scoped>

</style>
