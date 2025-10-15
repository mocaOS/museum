<template>
  <div class="relative flex size-full items-center justify-center">
    <div
      class="pointer-events-none w-full"
      :style="`aspect-ratio: ${getDimension().width}/${getDimension().height};padding-top: ${(getDimension().height / getDimension().width) * 100}%`"
    />

    <!-- Loader -->
    <div
      v-if="!loaded && props.showLoader && !isUnsupportedMediaType && canShowLoader && !isIFrame"
      class="absolute inset-0 z-1 flex items-center justify-center"
    >
      <div data-loader />
    </div>

    <div class="absolute inset-0 flex items-center justify-center" :class="{ 'z-2': isVideo }">
      <!-- 3D Model -->
      <div v-if="isModel" class="size-full">
        <ClientOnly>
          <MOCAModel
            @load="handleModelLoaded"
            @error="handleMediaError"
            :model-url="mediaInfo.url"
            :mtl-url="mediaInfo.mtl"
            :content-type="mediaInfo.content_type"
            :auto-rotate="true"
            :auto-rotate-delay="3000"
            rotation-per-second="30deg"
          />
        </ClientOnly>
      </div>

      <!-- SVG or Raw HTML content -->
      <div v-else-if="isSvgRaw || isRawContent" class="size-full">
        <iframe
          v-if="isIFrame"
          :src="mediaInfo.url"
          frameBorder="0"
          scrolling="no"
          class="pointer-events-none absolute inset-0 z-0 size-full"
        />
        <img
          @load="handleImageLoaded"
          v-else
          loading="lazy"
          :src="mediaInfo.url"
          :alt="mediaInfo.alt || ''"
          :class="twMerge(
            'size-full object-cover',
            props.cover && 'object-cover',
            props.contain && 'object-contain',
          )"
        >
      </div>

      <!-- Video or GIF -->
      <video
        @error="handleMediaError"
        @loadeddata="handleVideoLoaded"
        v-else-if="isVideo || isGif"
        ref="videoRef"
        :src="mediaError && isGif ? mediaInfo.url : transformedUrl"
        :poster="isGif ? posterUrl : undefined"
        :alt="mediaInfo.alt || 'Media'"
        :width="finalWidth"
        :height="finalHeight"
        autoplay
        muted
        loop
        :controls="videoControls"
        :controlsList="videoControls ? 'nodownload' : undefined"
        class="pointer-events-none max-h-full"
        :style="videoStyles"
      />

      <!-- Image -->
      <NuxtImg
        @load="handleImageLoaded"
        @error="handleImageError"
        v-else-if="isImage"
        provider="transform-in"
        :src="mediaInfo.url"
        :alt="mediaInfo.alt || 'Image'"
        :width="finalWidth"
        :height="finalHeight"
        loading="lazy"
        :class="twMerge(
          'size-full object-contain',
          props.cover && 'object-cover',
          props.contain && 'object-contain',
        )"
      />

      <!-- Fallback -->
      <div
        v-else
        class="
          flex size-full items-center justify-center bg-gray-100 object-cover
          text-gray-600
        "
      >
        Unsupported media type: {{ mediaInfo.type }}
      </div>
    </div>
  </div>
</template>

<script setup>
import config from "@local/config";
import { twMerge } from "tailwind-merge";
import { getImage } from "@/providers/transform-in";
import MOCAModel from "@/components/MOCAModel.vue";

const props = defineProps({
  mediaInfo: {
    type: Object,
    required: true,
  },
  width: {
    type: Number,
    default: null,
  },
  height: {
    type: Number,
    default: null,
  },
  full: {
    type: Boolean,
    default: false,
  },
  cover: {
    type: Boolean,
    default: false,
  },
  contain: {
    type: Boolean,
    default: false,
  },
  preload: {
    type: Boolean,
    default: false,
  },
  showLoader: {
    type: Boolean,
    default: true,
  },
  videoControls: {
    type: Boolean,
    default: false,
  },
  lazy: {
    type: Boolean,
    default: true,
  },
});

const videoRef = ref(null);
const mediaError = ref(false);
const loaded = ref(false);
const canShowLoader = ref(false);
// Media type detection
const isImage = computed(() => {
  return props.mediaInfo.type === "image"
    && !props.mediaInfo.content_type?.includes("gif")
    && !props.mediaInfo.content_type?.includes("svg")
    && !props.mediaInfo.url?.startsWith("data:");
});

const isGif = computed(() => {
  return props.mediaInfo.type === "image"
    && props.mediaInfo.content_type?.includes("gif");
});

const isVideo = computed(() => {
  return props.mediaInfo.type === "video";
});

const isModel = computed(() => {
  return props.mediaInfo.type === "model";
});

const isSvg = computed(() => {
  return props.mediaInfo.type === "svg"
    || props.mediaInfo.content_type?.includes("svg")
    || (props.mediaInfo.url?.endsWith("svg") && !props.mediaInfo.url?.includes("youtu"));
});

const isSvgRaw = computed(() => {
  return isSvg.value;
});

const isRawContent = computed(() => {
  return props.mediaInfo.url?.startsWith("data:")
    || (props.mediaInfo.type === "text" && props.mediaInfo.content_type === "text/html");
});

const isIFrame = computed(() => {
  return props.mediaInfo.type === "text"
    && props.mediaInfo.content_type === "text/html";
});

const isUnsupportedMediaType = computed(() => {
  return !isImage.value && !isGif.value && !isVideo.value && !isSvgRaw.value && !isRawContent.value && !isIFrame.value && !isModel.value;
});

// Dimension calculation
const originalWidth = computed(() => props.mediaInfo.width || 512);
const originalHeight = computed(() => props.mediaInfo.height || 512);
const aspectRatio = computed(() => originalWidth.value / originalHeight.value);

function getDimension() {
  const dimension = {
    width: calculateWidth(),
    height: calculateHeight(),
  };

  // Max size limitation (similar to MocaImage.jsx)
  const maxSize = 1280;
  if (dimension.width > 0 && dimension.height > 0) {
    while (dimension.width > maxSize || dimension.height > maxSize) {
      if (dimension.width > maxSize) {
        if (dimension.height > 0) {
          const percent = 100 / dimension.width * maxSize;
          dimension.height = Math.round(dimension.height * percent / 100);
          dimension.width = maxSize;
        } else {
          dimension.width = maxSize;
        }
      }

      if (dimension.height > maxSize) {
        if (dimension.width > 0) {
          const percent = 100 / dimension.height * maxSize;
          dimension.width = Math.round(dimension.width * percent / 100);
          dimension.height = maxSize;
        } else {
          dimension.height = maxSize;
        }
      }
    }
  }

  return dimension;
}

function calculateWidth() {
  if (props.full) return originalWidth.value;
  if (props.width) return props.width;
  if (props.height) {
    return Math.round((props.height / originalHeight.value) * originalWidth.value);
  }
  return 400;
}

function calculateHeight() {
  if (props.full) return originalHeight.value;
  if (props.height) return props.height;
  if (props.width) {
    return Math.round((props.width / originalWidth.value) * originalHeight.value);
  }
  return 400;
}

const finalWidth = computed(() => getDimension().width);
const finalHeight = computed(() => getDimension().height);

// Styling
const videoStyles = computed(() => {
  const styles = {
    width: props.full ? "100%" : `${finalWidth.value}px`,
    height: props.full ? "100%" : `${finalHeight.value}px`,
    objectFit: props.cover ? "cover" : props.contain ? "contain" : "cover",
  };

  if (!props.videoControls) {
    styles.pointerEvents = "none";
  }

  return styles;
});

// Transformations
const transformedUrl = computed(() => {
  if (isVideo.value || isGif.value) {
    try {
      const result = getImage(props.mediaInfo.url, {
        modifiers: {
          width: finalWidth.value,
          height: finalHeight.value,
          fit: "fill",
          format: "mp4",
          quality: 70,
          gravity: "ce",
        },
        baseURL: config.media.baseUrl,
      });
      return result.url;
    } catch (error) {
      console.warn("Failed to transform media URL:", error);
      return props.mediaInfo.url;
    }
  }
  return props.mediaInfo.url;
});

const posterUrl = computed(() => {
  if (isGif.value) {
    try {
      const result = getImage(props.mediaInfo.url, {
        modifiers: {
          width: finalWidth.value,
          height: finalHeight.value,
          fit: "fill",
          quality: 80,
          gravity: "ce",
        },
        baseURL: config.media.baseUrl,
      });
      return result.url;
    } catch (error) {
      return undefined;
    }
  }
  return undefined;
});

// Event handlers
function handleMediaError(event) {
  if (isGif.value) {
    console.warn("GIF MP4 transformation failed to load, falling back to original GIF");
    mediaError.value = true;
  }
  loaded.value = true;
}

function handleImageError() {
  console.warn("Image failed to load");
  loaded.value = true;
}

function handleImageLoaded() {
  loaded.value = true;
}

function handleVideoLoaded() {
  loaded.value = true;
}

function handleModelLoaded() {
  loaded.value = true;
}

onMounted(() => {
  if (props.preload) {
    loaded.value = true;
  }

  setTimeout(() => {
    canShowLoader.value = true;
  }, 100);
});
</script>

<style scoped>
[data-loader] {
  transform: scale(0.5);
  width: 80px;
  aspect-ratio: 1;
  border: 10px solid #0000;
  padding: 5px;
  box-sizing: border-box;
  background:
    radial-gradient(farthest-side,#fff 98%,#0000 ) 0 0/20px 20px no-repeat,
    conic-gradient(from 90deg at 10px 10px,#0000 90deg,#fff 0) content-box,
    conic-gradient(from -90deg at 40px 40px,#0000 90deg,#fff 0) content-box,
    #000;
  filter: blur(4px) contrast(10);
  animation: l11 2s infinite;
}
@keyframes l11 {
  0%   {background-position:0 0}
  25%  {background-position:100% 0}
  50%  {background-position:100% 100%}
  75%  {background-position:0% 100%}
  100% {background-position:0% 0}
}
</style>
