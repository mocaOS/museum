<template>
  <div class="size-full model-container">
    <div ref="modelViewerContainer" class="size-full" />

    <div v-if="loadError" class="error-container">
      <div class="error-message">
        Failed to load 3D model
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

// Define props with defaults based on model-viewer documentation
const props = defineProps({
  modelUrl: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: "A 3D model",
  },
  poster: {
    type: String,
    default: null,
  },
  shadowIntensity: {
    type: Number,
    default: 1,
  },
  autoRotate: {
    type: Boolean,
    default: false,
  },
  autoRotateDelay: {
    type: Number,
    default: 0,
  },
  rotationPerSecond: {
    type: String,
    default: "30deg",
  },
  ar: {
    type: Boolean,
    default: false,
  },
  arModes: {
    type: String,
    default: "webxr scene-viewer quick-look",
  },
  environmentImage: {
    type: String,
    default: "neutral",
  },
  exposure: {
    type: Number,
    default: 1,
  },
  cameraOrbit: {
    type: String,
    default: null,
  },
  minCameraOrbit: {
    type: String,
    default: null,
  },
  maxCameraOrbit: {
    type: String,
    default: null,
  },
  fieldOfView: {
    type: String,
    default: null,
  },
  minFieldOfView: {
    type: String,
    default: null,
  },
  maxFieldOfView: {
    type: String,
    default: null,
  },
  loading: {
    type: String,
    default: "auto",
  },
});

const emit = defineEmits([ "load", "error" ]);
const modelViewerContainer = ref(null);
const loadError = ref(false);
let modelViewerScript = null;
let modelViewerElement = null;

function handleModelLoaded() {
  loadError.value = false;
  emit("load");
}

function handleModelError(error) {
  console.warn("Error loading 3D model:", error);
  loadError.value = true;
  emit("error", error);
}

// Create model-viewer element programmatically
function createModelViewer() {
  if (!modelViewerContainer.value) return;

  // Create the element
  modelViewerElement = document.createElement("model-viewer");

  // Set attributes
  modelViewerElement.src = props.modelUrl;
  modelViewerElement.alt = props.alt;
  if (props.poster) modelViewerElement.poster = props.poster;
  modelViewerElement.shadowIntensity = props.shadowIntensity;
  modelViewerElement.cameraControls = true;
  modelViewerElement.autoRotate = props.autoRotate;
  modelViewerElement.autoRotateDelay = props.autoRotateDelay;
  modelViewerElement.rotationPerSecond = props.rotationPerSecond;
  modelViewerElement.ar = props.ar;
  modelViewerElement.arModes = props.arModes;
  modelViewerElement.environmentImage = props.environmentImage;
  modelViewerElement.exposure = props.exposure;
  modelViewerElement.interactionPrompt = "none";
  if (props.cameraOrbit) modelViewerElement.cameraOrbit = props.cameraOrbit;
  if (props.minCameraOrbit) modelViewerElement.minCameraOrbit = props.minCameraOrbit;
  if (props.maxCameraOrbit) modelViewerElement.maxCameraOrbit = props.maxCameraOrbit;
  if (props.fieldOfView) modelViewerElement.fieldOfView = props.fieldOfView;
  if (props.minFieldOfView) modelViewerElement.minFieldOfView = props.minFieldOfView;
  if (props.maxFieldOfView) modelViewerElement.maxFieldOfView = props.maxFieldOfView;
  modelViewerElement.loading = props.loading;

  // Set style
  modelViewerElement.style.width = "100%";
  modelViewerElement.style.height = "100%";
  modelViewerElement.style.setProperty("--poster-color", "transparent");

  // Add event listeners
  modelViewerElement.addEventListener("load", handleModelLoaded);
  modelViewerElement.addEventListener("error", handleModelError);

  // Append to container
  modelViewerContainer.value.appendChild(modelViewerElement);
}

onMounted(async () => {
  console.log(`Attempting to load 3D model: ${props.modelUrl}`);

  // Dynamically load the model-viewer script if not already loaded
  if (!document.querySelector("script[src*=\"model-viewer.min.js\"]")) {
    modelViewerScript = document.createElement("script");
    modelViewerScript.type = "module";
    modelViewerScript.src = "https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js";

    // Wait for script to load before creating the element
    await new Promise((resolve) => {
      modelViewerScript.onload = resolve;
      document.head.appendChild(modelViewerScript);
    });
  }

  // Create model-viewer element
  createModelViewer();
});

onBeforeUnmount(() => {
  // Remove event listeners
  if (modelViewerElement) {
    modelViewerElement.removeEventListener("load", handleModelLoaded);
    modelViewerElement.removeEventListener("error", handleModelError);
  }

  // Clean up the script if we added it (though generally not needed)
  if (modelViewerScript && document.head.contains(modelViewerScript)) {
    document.head.removeChild(modelViewerScript);
  }
});
</script>

<style scoped>
.model-container {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
}

.error-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.7);
}

.error-message {
  color: white;
  font-size: 16px;
  padding: 16px;
  background-color: rgba(255, 0, 0, 0.3);
  border-radius: 4px;
}
</style>
