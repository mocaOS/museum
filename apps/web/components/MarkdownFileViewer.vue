<template>
  <Dialog @update:open="handleOpenChange" v-model:open="isOpen">
    <DialogContent class="flex max-h-[90vh] max-w-5xl flex-col overflow-hidden">
      <ScrollArea class="flex-1" :auto-hide="true" :hide-delay="1000">
        <!-- Loading State -->
        <div v-if="isLoading" class="flex items-center justify-center py-8">
          <div class="flex items-center gap-3">
            <div
              class="
                h-6 w-6 animate-spin rounded-full border-2 border-primary
                border-t-transparent
              "
            />
            <span class="text-sm text-muted-foreground">Loading document...</span>
          </div>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="flex items-center justify-center py-8">
          <div class="text-center">
            <p class="text-sm font-medium text-destructive">
              {{ error }}
            </p>
            <Button
              @click="fetchContent"
              variant="outline"
              size="sm"
              class="mt-3"
            >
              Try Again
            </Button>
          </div>
        </div>

        <!-- Content Display -->
        <div v-else-if="content" class="relative">
          <!-- Image Loading Indicator -->
          <div
            v-if="!imagesLoaded"
            class="
              absolute top-0 right-0 left-0 z-10 bg-background/80
              backdrop-blur-sm
            "
          >
            <div class="flex items-center justify-center py-2">
              <div class="flex items-center gap-2">
                <div
                  class="
                    h-4 w-4 animate-spin rounded-full border-2 border-primary
                    border-t-transparent
                  "
                />
                <span class="text-xs text-muted-foreground">Loading images...</span>
              </div>
            </div>
          </div>

          <!-- Markdown Content -->
          <div
            :key="`content-${imagesLoaded}`"
            class="p-6 markdown-content"
            v-html="renderedContent"
          />
        </div>

        <!-- Empty State -->
        <div v-else class="flex items-center justify-center py-8">
          <p class="text-sm text-muted-foreground">
            No content available
          </p>
        </div>
      </ScrollArea>
    </DialogContent>
  </Dialog>
</template>

<script setup>
import MarkdownIt from "markdown-it";
import { readFiles } from "@directus/sdk";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scrollbar";

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  fileUrl: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    default: "",
  },
  summary: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([ "update:open" ]);

const config = useRuntimeConfig();
const isOpen = ref(props.open);
const isLoading = ref(false);
const error = ref(null);
const content = ref("");
const processedContent = ref("");
const imagesLoaded = ref(false);
const imageLoadingState = ref(new Map());

// Initialize markdown-it with the same configuration as the library page
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

// Configure markdown-it to allow <sub> tags
md.renderer.rules.sub_open = () => "<sub>";
md.renderer.rules.sub_close = () => "</sub>";

// Configure markdown-it to open links in a new tab
const defaultRender = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  // Add target="_blank" to each link
  tokens[idx].attrPush([ "target", "_blank" ]);
  tokens[idx].attrPush([ "rel", "noopener noreferrer" ]);

  // Pass rendering to default renderer
  return defaultRender(tokens, idx, options, env, self);
};

// Function to fetch file data from Directus by filename_download
async function fetchFileDataByFilename(filename) {
  const directus = useRawDirectus();
  try {
    const response = await directus.request(
      readFiles({
        filter: {
          filename_download: {
            _eq: filename,
          },
        },
        fields: [ "filename_disk", "filename_download", "id", "storage" ],
        limit: 1,
      }),
    );

    if (response && response.length > 0) {
      const file = response[0];
      // Construct the file URL using the base URL and file ID
      const fileUrl = `${config.public.api.baseUrl}/assets/${file.id}`;
      return {
        fileUrl,
        filename: file.filename_download,
        id: file.id,
      };
    }
  } catch (error) {
    console.error("Error fetching file data from Directus:", error);
  }
  return null;
}

// Function to extract filename from image path
function extractFilename(imagePath) {
  // Remove any leading slash and get the basename
  const cleanPath = imagePath.replace(/^\/+/, "");
  return cleanPath.split("/").pop();
}

// Function to process markdown content and replace image URLs
async function processMarkdownImages(markdownContent) {
  if (!markdownContent) return markdownContent;

  // Regular expression to match markdown images: ![alt](path) or ![alt](path "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g;

  let processedMarkdown = markdownContent;
  const matches = [ ...markdownContent.matchAll(imageRegex) ];

  // Process each image match
  for (const match of matches) {
    const fullMatch = match[0];
    const altText = match[1] || "";
    const imagePath = match[2];
    const title = match[3] || "";

    // Extract filename from the image path
    const filename = extractFilename(imagePath);

    // Only process if it looks like a local filename (not already a full URL)
    if (filename && !imagePath.startsWith("http") && !imagePath.startsWith("/assets/")) {
      try {
        const fileData = await fetchFileDataByFilename(filename);

        if (fileData) {
          // Replace the image path with the correct URL
          const titleAttr = title ? ` "${title}"` : "";
          const newImageMarkdown = `![${altText}](${fileData.fileUrl}${titleAttr})`;
          processedMarkdown = processedMarkdown.replace(fullMatch, newImageMarkdown);
        } else {
          // If file not found, remove the image markdown entirely
          console.warn(`Image file not found in Directus: ${filename}`);
          processedMarkdown = processedMarkdown.replace(fullMatch, "");
        }
      } catch (error) {
        console.error(`Error processing image ${filename}:`, error);
        // Remove the image markdown entirely if there's an error
        processedMarkdown = processedMarkdown.replace(fullMatch, "");
      }
    }
  }

  return processedMarkdown;
}

const renderedContent = computed(() => {
  if (!processedContent.value) return "";
  return md.render(processedContent.value);
});

// Function to track image loading
function trackImageLoading() {
  nextTick(() => {
    const contentElement = document.querySelector(".markdown-content");
    if (!contentElement) return;

    const images = contentElement.querySelectorAll("img");

    if (images.length === 0) {
      imagesLoaded.value = true;
      return;
    }

    imageLoadingState.value.clear();
    imagesLoaded.value = false;

    images.forEach((img, index) => {
      const imageId = `img-${index}`;
      imageLoadingState.value.set(imageId, false);

      if (img.complete) {
        // Image is already loaded
        imageLoadingState.value.set(imageId, true);
        checkAllImagesLoaded();
      } else {
        // Add load event listener
        img.addEventListener("load", () => {
          imageLoadingState.value.set(imageId, true);
          checkAllImagesLoaded();
        });

        img.addEventListener("error", () => {
          // Even if image fails to load, mark as "loaded" to prevent infinite waiting
          imageLoadingState.value.set(imageId, true);
          checkAllImagesLoaded();
        });
      }
    });
  });
}

// Function to check if all images are loaded
function checkAllImagesLoaded() {
  const allLoaded = Array.from(imageLoadingState.value.values()).every(loaded => loaded);
  if (allLoaded) {
    imagesLoaded.value = true;
    // Force a rerender by updating a reactive property
    nextTick(() => {
      // This will trigger any watchers and cause the component to rerender
      const event = new Event("imagesLoaded");
      document.dispatchEvent(event);
    });
  }
}

// Watch for changes in rendered content to track images
watch(renderedContent, () => {
  if (renderedContent.value) {
    trackImageLoading();
  }
});

// Watch for prop changes
watch(() => props.open, (newValue) => {
  isOpen.value = newValue;
  if (newValue && !content.value && !isLoading.value) {
    fetchContent();
  }
});

watch(() => props.fileUrl, () => {
  if (isOpen.value) {
    fetchContent();
  }
});

function handleOpenChange(newValue) {
  isOpen.value = newValue;
  emit("update:open", newValue);
}

async function fetchContent() {
  if (!props.fileUrl) return;

  isLoading.value = true;
  error.value = null;
  imagesLoaded.value = false;
  imageLoadingState.value.clear();

  try {
    // Construct the full URL
    const fullUrl = `${config.public.api.baseUrl}${props.fileUrl}`;

    const response = await fetch(fullUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
    }

    const text = await response.text();
    content.value = text;

    // Process markdown images
    processedContent.value = await processMarkdownImages(text);
  } catch (err) {
    console.error("Error fetching file content:", err);
    error.value = err.message || "Failed to load document";
  } finally {
    isLoading.value = false;
  }
}

// Fetch content when component mounts if dialog is open
onMounted(() => {
  if (isOpen.value) {
    fetchContent();
  }
});
</script>

<style scoped>
.markdown-content :deep(h1) {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 1rem;
  margin-top: 1.5rem;
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.5rem;
}

.markdown-content :deep(h2) {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  margin-top: 1.25rem;
  border-bottom: 1px solid hsl(var(--border));
  padding-bottom: 0.25rem;
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
  margin-bottom: 0.4rem;
  margin-top: 0.8rem;
}

.markdown-content :deep(h5) {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  margin-top: 0.6rem;
}

.markdown-content :deep(h6) {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
  margin-top: 0.5rem;
}

.markdown-content :deep(p) {
  margin-bottom: 1rem;
  line-height: 1.6;
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li) {
  margin-bottom: 0.25rem;
  line-height: 1.5;
}

.markdown-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  text-underline-offset: 2px;
}

.markdown-content :deep(a:hover) {
  text-decoration: none;
}

.markdown-content :deep(blockquote) {
  border-left: 4px solid hsl(var(--border));
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  color: hsl(var(--muted-foreground));
}

.markdown-content :deep(code) {
  background-color: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
  font-size: 0.875em;
}

.markdown-content :deep(pre) {
  background-color: hsl(var(--muted));
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1rem 0;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
  font-size: 0.875rem;
}

.markdown-content :deep(hr) {
  border: 0;
  border-top: 1px solid hsl(var(--border));
  margin: 1.5rem 0;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  overflow: hidden;
  border-radius: 0.5rem;
  border: 1px solid hsl(var(--border));
}

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid hsl(var(--border));
  padding: 0.75rem;
  text-align: left;
}

.markdown-content :deep(th) {
  background-color: hsl(var(--muted));
  font-weight: 600;
}

.markdown-content :deep(tbody tr:nth-child(even)) {
  background-color: hsl(var(--muted) / 0.5);
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.5rem;
  margin: 1rem 0;
  display: block;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.markdown-content :deep(strong) {
  font-weight: 600;
}

.markdown-content :deep(em) {
  font-style: italic;
}

.markdown-content :deep(del) {
  text-decoration: line-through;
}

.markdown-content :deep(sup) {
  font-size: 0.75rem;
  line-height: 0;
  position: relative;
  top: -0.5em;
}

.markdown-content :deep(sub) {
  font-size: 0.75rem;
  line-height: 0;
  position: relative;
  top: 0.25em;
}
</style>
