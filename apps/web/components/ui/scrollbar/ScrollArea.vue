<template>
  <div
    @scroll="handleScroll"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    ref="scrollArea"
    class="relative overflow-auto scroll-area"
    :class="[
      wrapperClass,
      {
        'scroll-area--auto-hide': autoHide,
        'scroll-area--always-visible': !autoHide,
      },
    ]"
    :style="wrapperStyle"
  >
    <div
      class="scroll-content"
      :class="contentClass"
      :style="contentStyle"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  autoHide?: boolean;
  hideDelay?: number;
  wrapperClass?: string;
  wrapperStyle?: Record<string, any>;
  contentClass?: string;
  contentStyle?: Record<string, any>;
}

const props = withDefaults(defineProps<Props>(), {
  autoHide: true,
  hideDelay: 1000,
  wrapperClass: "",
  wrapperStyle: () => ({}),
  contentClass: "",
  contentStyle: () => ({}),
});

const emit = defineEmits<{
  scroll: [event: Event];
}>();

const scrollArea = ref<HTMLElement>();
const isHovered = ref(false);
const isScrolling = ref(false);
let scrollTimeout: NodeJS.Timeout | null = null;

function handleScroll(event: Event) {
  emit("scroll", event);

  if (props.autoHide) {
    isScrolling.value = true;

    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(() => {
      isScrolling.value = false;
    }, props.hideDelay);
  }
}

function handleMouseEnter() {
  isHovered.value = true;
}

function handleMouseLeave() {
  isHovered.value = false;
}

onUnmounted(() => {
  if (scrollTimeout) {
    clearTimeout(scrollTimeout);
  }
});

// Expose the scroll element for external access
defineExpose({
  scrollEl: scrollArea,
});
</script>

<style scoped>
.scroll-area {
  /* Custom scrollbar styles */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
  transition: scrollbar-color 0.2s ease-in-out;
}

/* Webkit browsers (Chrome, Safari, Edge) */
.scroll-area::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scroll-area::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 4px;
}

.scroll-area::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 4px;
  transition: background-color 0.2s ease-in-out;
}

.scroll-area::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklch, var(--color-muted-foreground) 80%, transparent);
}

.scroll-area::-webkit-scrollbar-corner {
  background: transparent;
}

/* Show scrollbar on hover or while scrolling */
.scroll-area--auto-hide:hover,
.scroll-area--auto-hide:focus-within {
  scrollbar-color: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent) transparent;
}

.scroll-area--auto-hide:hover::-webkit-scrollbar-thumb,
.scroll-area--auto-hide:focus-within::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent);
}

/* Always visible scrollbar */
.scroll-area--always-visible {
  scrollbar-color: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent) transparent;
}

.scroll-area--always-visible::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent);
}

/* Enhanced hover state */
.scroll-area:hover::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--color-muted-foreground) 80%, transparent);
}

/* Firefox specific styling */
@supports (scrollbar-width: thin) {
  .scroll-area--auto-hide {
    scrollbar-color: transparent transparent;
  }

  .scroll-area--auto-hide:hover,
  .scroll-area--auto-hide:focus-within {
    scrollbar-color: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent) transparent;
  }

  .scroll-area--always-visible {
    scrollbar-color: color-mix(in oklch, var(--color-muted-foreground) 60%, transparent) transparent;
  }
}

.scroll-content {
  /* Ensure content takes full space */
  min-height: 100%;
}
</style>
