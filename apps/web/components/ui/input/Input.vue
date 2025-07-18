<template>
  <div class="relative w-full">
    <div v-if="leadingIcon" class="absolute top-1/2 left-3 -translate-y-1/2">
      <Icon :icon="leadingIcon" />
    </div>
    <input
      v-model="modelValue"
      :placeholder="placeholder"
      v-bind="$attrs"
      :class="cn(
        `
          flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent
          text-base shadow-xs transition-[color,box-shadow] outline-none
          selection:bg-primary selection:text-primary-foreground
          file:inline-flex file:h-7 file:border-0 file:bg-transparent
          file:text-sm file:font-medium file:text-foreground
          placeholder:text-muted-foreground
          disabled:pointer-events-none disabled:cursor-not-allowed
          disabled:opacity-50
          md:text-sm
          dark:bg-background
        `,
        `
          focus-visible:border-ring focus-visible:ring-[3px]
          focus-visible:ring-ring/50
        `,
        `
          aria-invalid:border-destructive aria-invalid:ring-destructive/20
          dark:aria-invalid:ring-destructive/40
        `,
        leadingIcon ? 'pl-10' : 'pl-3',
        hasRightSlot ? 'pr-10' : trailingIcon ? 'pr-10' : 'pr-3',
        'py-1',
        props.class,
      )"
    >
    <div
      @click="emits('trailingIconClick')"
      v-if="trailingIcon"
      class="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer"
    >
      <Icon :icon="trailingIcon" />
    </div>
    <!-- Right slot for custom content like send button -->
    <div
      v-if="$slots.right"
      class="absolute top-1/2 right-3 -translate-y-1/2"
    >
      <slot name="right" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HTMLAttributes } from "vue";
import { useVModel } from "@vueuse/core";
import { computed, useSlots } from "vue";
import { cn } from "~/lib/utils";
import Icon from "~/components/App/Icon.vue";

const props = defineProps<{
  defaultValue?: string | number;
  modelValue?: string | number;
  leadingIcon?: string;
  trailingIcon?: string;
  placeholder?: string;
  class?: HTMLAttributes["class"];
}>();

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void;
  (e: "trailingIconClick"): void;
}>();

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
});

// Check if right slot is used
const hasRightSlot = computed(() => !!useSlots().right);
</script>
