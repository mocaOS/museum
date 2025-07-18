<template>
  <Icon :icon="icon" />
</template>

<script setup lang="ts">
import { Icon, addCollection } from "@iconify/vue";
import moca from "~/svg/output/moca.json";

defineProps<{
  icon: string;
}>();

addCollection(moca);
</script>
