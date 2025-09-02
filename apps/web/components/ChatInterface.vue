<template>
  <div
    :class="twMerge(
      `
        fixed right-0 bottom-0 z-50 flex h-screen w-full flex-col items-end
        lg:max-w-lg
      `,
      !isOpen && 'w-0',
    )"
  >
    <!-- Chat Sheet -->
    <Sheet v-model:open="isOpen" class="size-full">
      <SheetContent
        class="
          size-full p-0
          sm:max-w-full
          lg:max-w-xl
        "
        position="right"
        size="full"
      >
        <Card
          class="
            bg-background-200 flex h-full flex-col rounded-none border-0 pb-0
            shadow-none
          "
        >
          <SheetHeader class="border-b px-4 py-3">
            <SheetTitle class="flex items-center gap-4 text-foreground">
              R2R Chat
              <Button
                @click="resetChat"
                variant="secondary"
                size="sm"
                class="flex items-center gap-1 text-foreground"
              >
                <div class="flex items-center gap-1">
                  <RefreshCcw size="16" />
                </div>
              </Button>
            </SheetTitle>
          </SheetHeader>

          <!-- Chat Messages -->
          <div
            ref="messagesContainer"
            class="
              bg-background-200 flex-1 space-y-4 overflow-y-auto p-4 text-sm
            "
          >
            <div
              v-for="message in messages"
              :key="message.id"
              class="flex flex-col"
              :class="message.isUser ? 'items-end' : 'items-start'"
            >
              <div
                class="max-w-[80%] rounded-lg px-4 py-2"
                :class="message.isUser
                  ? 'rounded-br-none bg-primary'
                  : 'rounded-bl-none bg-muted text-foreground'"
              >
                <template v-if="message.isUser">
                  {{ message.text }}
                </template>
                <div v-else class="markdown-content" v-html="message.text" />

                <!-- Citation source boxes -->
                <div
                  @scroll="handleCitationScroll"
                  v-if="message.citations && message.citations.length > 0"
                  :id="`citation-container-${message.id}`"
                  class="
                    relative my-3 inline-flex max-w-full gap-2 overflow-x-auto
                    hide-scrollbar
                  "
                  :class="getScrollGradientClass(message.id)"
                >
                  <div
                    @click="showCitationDetails(citation)"
                    v-for="(citation, index) in message.citations"
                    :key="citation.id"
                    data-citation-box
                    :data-citation-id="citation.id"
                    class="
                      group flex min-w-[40%] cursor-pointer flex-col gap-1
                      rounded-md bg-muted p-3 text-xs
                    "
                  >
                    <span
                      class="
                        font-medium text-white/80
                        group-hover:text-white
                      "
                    >{{ getCitationSourceName(citation) }} {{ index + 1 }}</span>
                    <span
                      class="
                        line-clamp-2 text-white/50
                        group-hover:text-white/80
                      "
                    >{{ citation.payload.content?.description || citation.payload.text }}</span>
                  </div>
                </div>
              </div>
              <span class="mt-1 text-xs text-gray-600">
                {{ formattedTimestamp(message.timestamp) }}
              </span>
            </div>
          </div>

          <!-- Input Area -->
          <div class="border-t bg-muted p-4 text-foreground">
            <div class="flex space-x-2">
              <VanishingInput
                @submit="sendMessage"
                @change="(event) => messageInput = event.target.value"
                v-model="messageInput"
                :placeholders="placeholders"
                :disabled="isWaitingForResponse"
                class="w-full"
              />
            </div>
          </div>
        </Card>
      </SheetContent>
    </Sheet>

    <!-- Citation Dialog -->
    <Dialog v-model:open="showCitationDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle class="max-w-lg truncate">
            {{ citationData.title || 'Citation' }}
          </DialogTitle>
          <DialogDescription>
            {{ citationData.summary || 'No summary available' }}
          </DialogDescription>
          <DialogFooter>
            <a
              href="/test.md"
              target="_blank"
              class="text-accent-800 mt-2 flex items-center gap-1 text-xs"
            >
              <i>{{ citationData.title }}</i>
              <ExternalLink size="14" />
            </a>
          </DialogFooter>
        </DialogHeader>
      </DialogContent>
    </Dialog>

    <!-- Chat Toggle Button -->
    <Button
      @click="toggleChat"
      class="
        absolute right-6 bottom-6 flex size-14 items-center justify-center
        rounded-full p-0 shadow-lg
      "
    >
      <MessageCircle v-if="!isOpen" size="24" />
      <X v-else size="24" />
    </Button>
  </div>
</template>

<script setup>
import { ExternalLink, MessageCircle, RefreshCcw, X } from "lucide-vue-next";
import MarkdownIt from "markdown-it";
import { twMerge } from "tailwind-merge";
import { onMounted, onUnmounted } from "vue";
import { VanishingInput } from "@/components/ui/vanishing-input";

// Global Constants
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
  // Add target="_blank" and rel attributes to links
  tokens[idx].attrPush([ "target", "_blank" ]);
  tokens[idx].attrPush([ "rel", "noopener noreferrer" ]);

  // Return the default rendering
  return defaultRender(tokens, idx, options, env, self);
};

const { client, createConversation } = useR2R();

const isOpen = ref(false);
const isWaitingForResponse = ref(false);
const messagesContainer = ref(null);
const messageInput = ref("");
const showCitationDialog = ref(false);
const citationData = ref({
  id: "",
  documentId: "",
  title: "",
  summary: "",
});
const messages = ref([
  {
    id: 1,
    text: "You can ask me anything about the Museum of Crypto Art 🥳",
    isUser: false,
    timestamp: new Date(),
  },
]);
const searchResults = ref([]);

// Track conversation ID for the current chat session
const conversationId = ref(null);

// Store scroll states for citation containers
const scrollStates = ref({});

const placeholders = [
  "What is the mission of the Museum of Crypto Art?",
  "How did MOCA impact web3 culture over the past years?",
  "Can you tell me about the Genesis Collection?",
  "What is the $MOCA token all about?",
  "Which orgs are most important for cryptoart?",
  "How does the MOCA support the artists?",
  "What makes the Museum of Crypto Art different from traditional museums?",
  "How does Blockchain technology influence digital art?",
  "What are the origins of Cryptoart?",
  "Which notable artists are featured in the MOCA collection?",
  "How can I contribute to the Museum of Crypto Art?",
  "Can you please explain MOCA ROOMs?",
  "How does MOCA handle curation and exhibition of digital art?",
  "What are art decc0s and whats the origin of them?",
  "Can you explain the MOCA 2.0 roadmap for a five year old?",
  "How can I participate in the MOCA DAO?",
  "Which virtual exhibitions has MOCA hosted in the past?",
  "How does MOCA preserve the history of crypto art?",
];

// Lifecycle hooks
watch(messages, () => {
  scrollToBottom();
}, { deep: true });

// Watch for when the chat is opened
watch(isOpen, async (newValue) => {
  if (newValue === true) {
    // Scroll to bottom when chat is opened
    scrollToBottom();
    // Add a second attempt with a delay to ensure it scrolls after animations
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }
});

// Add event listener for citation clicks
onMounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.addEventListener("click", handleCitationClick);
  }
});

onUnmounted(() => {
  if (messagesContainer.value) {
    messagesContainer.value.removeEventListener("click", handleCitationClick);
  }
});

// Create a new conversation
async function createNewConversation() {
  try {
    // Create a new conversation using the R2R client's createConversation method
    const { results } = await createConversation(`Chat Session ${new Date().toLocaleString()}`);
    conversationId.value = results.id;
    console.log("Created new conversation with ID:", conversationId.value);
    return conversationId.value;
  } catch (error) {
    console.error("Failed to create a new conversation:", error);
    return null;
  }
}

// Handle citation click
function handleCitationClick(event) {
  // Check if the clicked element is a citation number (sup element)
  if (event.target && event.target.tagName.toLowerCase() === "sup" && event.target.dataset.id) {
    const citationId = event.target.dataset.id;
    if (citationId) {
      // Find the matching citation in the messages
      const currentMessage = messages.value.find(msg => msg.citations
        && msg.citations.some(citation => citation.id === citationId));

      if (currentMessage) {
        const citation = currentMessage.citations.find(c => c.id === citationId);
        if (citation) {
          showCitationDetails(citation);
        }
      }
    }
  }

  // Also handle clicks on citation boxes at the bottom of messages
  if (event.target.closest("[data-citation-box]")) {
    const clickedBox = event.target.closest("[data-citation-box]");
    const citationId = clickedBox.dataset.citationId;
    if (citationId) {
      const currentMessage = messages.value.find(msg => msg.citations
        && msg.citations.some(citation => citation.id === citationId));

      if (currentMessage) {
        const citation = currentMessage.citations.find(c => c.id === citationId);
        if (citation) {
          showCitationDetails(citation);
        }
      }
    }
  }
}

// Reset chat and start a new conversation
async function resetChat() {
  messages.value = [
    {
      id: Date.now(),
      text: "You can ask me anything about the Museum of Crypto Art 🥳",
      isUser: false,
      timestamp: new Date(),
    },
  ];
  searchResults.value = [];

  // Create a new conversation immediately
  try {
    conversationId.value = await createNewConversation();
    console.log("Created new conversation on reset with ID:", conversationId.value);
  } catch (error) {
    console.error("Failed to create a new conversation on reset:", error);
  }
}

function formattedTimestamp(timestamp) {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;

      // Add a second attempt with a slight delay to ensure scrolling works
      setTimeout(() => {
        if (messagesContainer.value) {
          messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
        }
      }, 100);
    }
  });
}

function toggleChat() {
  isOpen.value = !isOpen.value;
}

function sendMessage() {
  if (!messageInput.value.trim() || isWaitingForResponse.value) return;
  isWaitingForResponse.value = true;

  // Add user message to chat
  const userMessage = {
    id: Date.now(),
    text: messageInput.value,
    isUser: true,
    timestamp: new Date(),
  };
  messages.value.push(userMessage);

  // Clear input field
  const userQuery = messageInput.value.trim();
  messageInput.value = "";

  // Get or create the R2R client
  const getOrCreateConversationId = async () => {
    if (!conversationId.value) {
      return await createNewConversation();
    }
    return conversationId.value;
  };

  // Process the user's message
  getOrCreateConversationId().then(async (convoId) => {
    try {
      // Use R2R's RAG functionality
      console.log("Starting R2R RAG request with conversation ID:", convoId);

      try {
        // Create a placeholder message immediately
        const responseId = Date.now() + 1;
        const responseMessage = {
          id: responseId,
          text: "Searching for information...",
          isUser: false,
          timestamp: new Date(),
          searchResults: [],
        };

        // Add the message to the UI first
        messages.value.push(responseMessage);
        scrollToBottom();

        // Make the API call with improved instructions to prevent function call leakage
        const streamingResponse = await client.retrieval.agent({
          message: {
            role: "user",
            content: userQuery,
          },
          conversationId: convoId,
          searchMode: "custom",
          searchSettings: {
            useHybridSearch: false,
            useSemanticSearch: true,
            filters: {},
            limit: 4,
            chunkSettings: {
              indexMeasure: "cosine_distance",
              enabled: true,
            },
            graphSettings: {
              enabled: true,
            },
          },
          ragGenerationConfig: {
            stream: true,
            temperature: 0.1,
            topP: 1,
            maxTokensToSample: 1024,
            model: "openai/hermes4:70b",
          },
        });

        console.log("Got streaming response object:", typeof streamingResponse);

        // Process streaming events
        let responseText = "";
        const citations = [];
        const currentResponseId = responseId;

        // Process the streaming events
        if (Symbol.asyncIterator in streamingResponse) {
          for await (const rawEvent of streamingResponse) {
            // Decode the Uint8Array to string
            const textDecoder = new TextDecoder();
            const eventText = textDecoder.decode(rawEvent);

            // Parse the SSE format - split by double newlines to handle multiple events in one chunk
            const eventChunks = eventText.split("\n\n").filter(chunk => chunk.trim());

            for (const eventChunk of eventChunks) {
              const eventLines = eventChunk.split("\n");
              let eventType = "";
              let eventData = "";

              for (const line of eventLines) {
                if (line.startsWith("event:")) {
                  eventType = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                  eventData = line.substring(5).trim();
                }
              }

              // Skip empty events or done events
              if (!eventType || !eventData || eventData === "[DONE]") {
                if (eventType === "done") {
                  console.log("Stream completed");
                }
                continue;
              }

              // Process different event types
              try {
                const parsedData = JSON.parse(eventData);
                let deltaText, citationIndex, citationSpan, beforeCitation, afterCitation, finalText, finalCitations;
                let existingCitationIndex, citationNumber;

                switch (eventType) {
                  case "search_results":
                    console.log("Search results received!");
                    // Store search results
                    searchResults.value = parsedData.data;
                    messages.value = messages.value.map(msg =>
                      msg.id === currentResponseId
                        ? { ...msg, text: "Finding relevant information...", searchResults: parsedData.data }
                        : msg,
                    );
                    break;

                  case "message":
                    if (parsedData.delta && parsedData.delta.content) {
                      // Extract message content
                      deltaText = parsedData.delta.content[0]?.payload?.value || "";
                      console.log("Received message delta:", deltaText);

                      // Filter out function call syntax
                      if (!deltaText.includes("Function Call") && !deltaText.match(/^\s*\{\s*"name"\s*:/)) {
                        responseText += deltaText;
                      } else {
                        console.log("Filtered out function call:", deltaText);
                      }

                      // Update the message in the UI
                      messages.value = messages.value.map(msg =>
                        msg.id === currentResponseId
                          ? { ...msg, text: md.render(responseText) }
                          : msg,
                      );

                      // Scroll to bottom as content comes in
                      scrollToBottom();
                    }
                    break;

                  case "citation":
                    console.log("New citation event:", parsedData);
                    // Check if this citation has already been processed
                    existingCitationIndex = citations.findIndex(c => c.id === parsedData.id);

                    if (existingCitationIndex === -1) {
                      // This is a new citation, add it to the array
                      citations.push(parsedData);
                      citationNumber = citations.length;

                      // Replace all instances of this citation ID with the numeric reference
                      while (responseText.includes(`[${parsedData.id}]`)) {
                        responseText = responseText.replace(
                          `[${parsedData.id}]`,
                          `<sup data-id="${parsedData.id}">${citationNumber}</sup>`,
                        );
                      }
                    } else {
                      // Citation already exists, use its existing number
                      citationNumber = existingCitationIndex + 1;

                      // Replace all instances of this citation ID with the numeric reference
                      while (responseText.includes(`[${parsedData.id}]`)) {
                        responseText = responseText.replace(
                          `[${parsedData.id}]`,
                          `<sup data-id="${parsedData.id}">${citationNumber}</sup>`,
                        );
                      }
                    }

                    // Update the message with numeric citations
                    messages.value = messages.value.map(msg =>
                      msg.id === currentResponseId
                        ? {
                            ...msg,
                            text: md.render(responseText),
                            citations,
                          }
                        : msg,
                    );
                    break;

                  case "final_answer":
                    console.log("Final answer received:", parsedData);
                    break;
                  default:
                    console.log(`Unhandled event type: ${eventType}`);
                }
              } catch (error) {
                // If JSON parsing fails, log the error and continue
                console.error(`Error parsing ${eventType} event: ${error.message}`);

                // For debugging, log the first part of the data
                if (eventData && eventData.length > 100) {
                  console.error("Data begins with:", `${eventData.substring(0, 100)}...`);
                } else {
                  console.error("Data:", eventData);
                }
              }
            }
          }
        }

        // Reset waiting state after processing all events
        isWaitingForResponse.value = false;
      } catch (error) {
        console.error("Error in R2R RAG request:", error);

        // Specific handling for Maximum iterations exceeded error
        let errorMessage = error.message || "Failed to get a response. Please try again.";

        // Check if it's the specific iteration error
        if (errorMessage.includes("Maximum iterations exceeded")) {
          errorMessage = "The query was too complex to process. Please try asking a simpler or more specific question.";
        }

        // Add error message to chat
        messages.value.push({
          id: Date.now() + 3,
          text: `⚠️ Error: ${errorMessage}`,
          isUser: false,
          timestamp: new Date(),
        });
      }
    } catch (error) {
      console.error("Error creating conversation:", error);
      isWaitingForResponse.value = false;
      messages.value.push({
        id: Date.now() + 3,
        text: "Sorry, I couldn't create a conversation. Please try again.",
        isUser: false,
        timestamp: new Date(),
      });
    } finally {
      isWaitingForResponse.value = false;
      scrollToBottom();
    }
  }).catch((error) => {
    console.error("Error creating conversation:", error);
    isWaitingForResponse.value = false;
    messages.value.push({
      id: Date.now() + 3,
      text: "Sorry, I couldn't create a conversation. Please try again.",
      isUser: false,
      timestamp: new Date(),
    });
  });
}

// Citation helper methods
function getCitationSourceName(citation) {
  // Extract source name from citation data
  // This is a placeholder - adjust based on your actual citation data structure
  return citation.payload?.source || citation.payload?.content?.source || "Source";
}

function showCitationDetails(citation) {
  // Show citation data in the dialog
  citationData.value = {
    id: citation.id,
    documentId: citation.payload.document_id || "",
    title: citation.payload.text
      ? `${citation.payload.text.substring(0, 100)}...`
      : (citation.payload.content?.name || "Citation"),
    summary: citation.payload.text || citation.payload.content?.description || "No content available",
  };
  showCitationDialog.value = true;
}

// Handle citation container scroll
function handleCitationScroll(event) {
  const container = event.target;
  const messageId = Number.parseInt(container.id.replace("citation-container-", ""));

  // Calculate scroll position
  const isAtStart = container.scrollLeft <= 10;
  const isAtEnd = container.scrollLeft + container.offsetWidth >= container.scrollWidth - 10;

  // Store the scroll state for this specific message
  scrollStates.value[messageId] = {
    isAtStart,
    isAtEnd,
    hasOverflow: container.scrollWidth > container.offsetWidth,
  };
}

// Get the appropriate gradient class based on scroll position
function getScrollGradientClass(messageId) {
  const state = scrollStates.value[messageId];
  const message = messages.value.find(m => m.id === messageId);

  // If we don't have scroll state yet or less than 3 citations, don't apply gradients
  if (!state || !message || message.citations.length <= 2) {
    return {};
  }

  // If no overflow, no need for gradients
  if (!state.hasOverflow) {
    return {};
  }

  // Determine which gradients to show
  if (state.isAtStart && !state.isAtEnd) {
    return { "mask-gradient-right": true };
  } else if (!state.isAtStart && state.isAtEnd) {
    return { "mask-gradient-left": true };
  } else if (!state.isAtStart && !state.isAtEnd) {
    return { "mask-gradient-both": true };
  }

  return {};
}

// Ensure we update scroll states when new messages are added
watch(messages, () => {
  // Allow DOM to update before checking scroll positions
  nextTick(() => {
    const containers = document.querySelectorAll("[id^=\"citation-container-\"]");
    containers.forEach((container) => {
      const messageId = Number.parseInt(container.id.replace("citation-container-", ""));
      if (messageId) {
        scrollStates.value[messageId] = {
          isAtStart: true,
          isAtEnd: container.scrollWidth <= container.offsetWidth,
          hasOverflow: container.scrollWidth > container.offsetWidth,
        };
      }
    });
  });
}, { deep: true });
</script>

<style scoped>
.markdown-content :deep(h1) {
  font-size: 1.5rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  margin-top: 1rem;
}

.markdown-content :deep(h2) {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  margin-top: 0.75rem;
}

.markdown-content :deep(h3) {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.4rem;
  margin-top: 0.6rem;
}

.markdown-content :deep(h4) {
  font-size: 1rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
  margin-top: 0.5rem;
}

.markdown-content :deep(p) {
  margin-bottom: 0.75rem;
  line-height: 1.5;
  word-wrap: break-word;
}

.markdown-content :deep(ul), .markdown-content :deep(ol) {
  margin-bottom: 0.75rem;
  padding-left: 1.5rem;
}

.markdown-content :deep(ul) {
  list-style-type: disc;
}

.markdown-content :deep(ol) {
  list-style-type: decimal;
}

.markdown-content :deep(li) {
  margin-bottom: 0.3rem;
}

.markdown-content :deep(a) {
  color: #ffffff;
  text-decoration: underline;
}

.light .markdown-content :deep(a) {
  color: #171717;
}

.markdown-content :deep(blockquote) {
  border-left: 3px solid #6b7280;
  padding-left: 0.75rem;
  font-style: italic;
  margin: 0.75rem 0;
}

.markdown-content :deep(code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 0.1rem 0.3rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.light .markdown-content :deep(code) {
  background-color: #e5e7eb;
}

.markdown-content :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.75rem;
  border-radius: 0.4rem;
  overflow-x: auto;
  margin: 0.75rem 0;
}

.light .markdown-content :deep(pre) {
  background-color: #f3f4f6;
}

.markdown-content :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-content :deep(hr) {
  border: 0;
  border-top: 1px solid #4b5563;
  margin: 1rem 0;
}

.light .markdown-content :deep(hr) {
  border-top-color: #d1d5db;
}

.markdown-content :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.25rem;
}

.markdown-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.75rem 0;
}

.markdown-content :deep(th), .markdown-content :deep(td) {
  border: 1px solid #4b5563;
  padding: 0.4rem;
}

.light .markdown-content :deep(th), .light .markdown-content :deep(td) {
  border-color: #d1d5db;
}

.markdown-content :deep(th) {
  background-color: rgba(255, 255, 255, 0.1);
}

.light .markdown-content :deep(th) {
  background-color: #f3f4f6;
}

.markdown-content :deep(.citation) {
  cursor: pointer;
  color: #ffffff;
  font-size: 80%;
  font-family: monospace;
  padding: 0.1rem 0.3rem;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 0.25rem;
  transition: background-color 0.2s ease;
}

.light .markdown-content :deep(.citation) {
  color: #171717;
  background-color: #e5e7eb;
}

.markdown-content :deep(.citation:hover) {
  background-color: rgba(255, 255, 255, 0.3);
}

.light .markdown-content :deep(.citation:hover) {
  background-color: #d1d5db;
}

.markdown-content :deep(sup) {
  font-size: 0.75rem;
  font-family: monospace;
  line-height: 0;
  position: relative;
  top: -0.1em;
  padding: 0.1em 0.3em;
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.light .markdown-content :deep(sup) {
  background-color: rgba(0, 0, 0, 0.1);
  color: #000;
}

.light .markdown-content :deep(sup:hover) {
  background-color: rgba(0, 0, 0, 0.2);
}

.hide-scrollbar {
  -ms-overflow-style: none;  /* IE and Edge */
  scrollbar-width: none;     /* Firefox */
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;             /* Chrome, Safari and Opera */
}

.mask-gradient-right {
  mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 80%, rgba(0, 0, 0, 0));
  -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 1) 80%, rgba(0, 0, 0, 0));
}

.mask-gradient-left {
  mask-image: linear-gradient(to left, rgba(0, 0, 0, 1) 80%, rgba(0, 0, 0, 0));
  -webkit-mask-image: linear-gradient(to left, rgba(0, 0, 0, 1) 80%, rgba(0, 0, 0, 0));
}

.mask-gradient-both {
  mask-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 10%, rgba(0, 0, 0, 1) 90%, rgba(0, 0, 0, 0));
  -webkit-mask-image: linear-gradient(to right, rgba(0, 0, 0, 0), rgba(0, 0, 0, 1) 10%, rgba(0, 0, 0, 1) 90%, rgba(0, 0, 0, 0));
}
</style>
