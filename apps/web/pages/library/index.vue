<template>
  <div>
    <!-- Header -->
    <div
      class="
        sticky top-[calc(4rem+1px)] z-40 mb-8 border-b bg-background/20
        backdrop-blur-md
      "
    >
      <div class="container flex items-center justify-between py-2">
        <h1 class="text-base font-medium">
          Talk to the Librarian
        </h1>
        <Button @click="resetChat" size="sm">
          <div class="flex items-center gap-1">
            <RefreshCcw size="16" />
            <span
              class="
                hidden
                sm:block
              "
            >New Conversation</span>
          </div>
        </Button>
      </div>
    </div>

    <div
      class="
        relative container mx-auto min-h-[calc(100vh-10rem)]
        max-w-(--breakpoint-md) pb-32
      "
    >
      <div
        v-if="!messages.length"
        class="
          absolute inset-0 bottom-[5vh] z-10 mx-auto flex flex-col items-center
          justify-center px-4 text-center
        "
      >
        <div class="mb-12 max-w-xs font-medium">
          Welcome to Library. Ask anything about Cryptoart and Web3 Culture 🥳
        </div>
        <div class="grid w-full grid-cols-2 gap-2">
          <Button
            @click="messageInput = question; sendMessage()"
            v-for="(question, index) in initialQuestions"
            :key="index"
            variant="outline"
            class="
              group h-auto min-h-14 w-full justify-start bg-secondary py-3
              text-left text-xs font-extralight whitespace-break-spaces
              sm:text-sm
            "
          >
            {{ question }}
          </Button>
        </div>
      </div>
      <!-- Filter and Search Bar -->
      <div class="mb-6 flex flex-wrap items-center gap-5">
        <!-- Chat Messages -->
        <div ref="messagesContainer" class="flex-1 overflow-y-auto text-sm">
          <div
            v-for="message in messages"
            :key="message.id"
            :class="twMerge(
              'flex flex-col',
              !message.isUser && 'mb-8',
            )"
          >
            <div class="rounded-lg py-2">
              <div
                v-if="message.isUser"
                class="
                  text-xl
                  sm:text-2xl
                "
              >
                {{ message.text }}
              </div>
              <div v-else class="markdown-content" v-html="message.text" />
            </div>

            <!-- Citation source boxes -->
            <div
              @scroll="handleCitationScroll"
              @wheel.prevent="handleCitationWheel"
              v-if="message.citations && message.citations.length > 0"
              :id="`citation-container-${message.id}`"
              class="
                relative my-3 inline-flex max-w-full gap-2 overflow-x-auto
                hide-scrollbar
              "
              :class="getScrollGradientClass(message.id)"
            >
              <Button
                @click="showCitationDetails(citation)"
                v-for="(citation, index) in message.citations"
                :key="citation.id"
                variant="outline"
                data-citation-box
                :data-citation-id="citation.id"
                class="
                  group line-clamp-3 flex h-auto max-w-[75%] min-w-[75%]
                  cursor-pointer flex-col justify-start gap-1 bg-secondary p-3
                  text-left text-xs whitespace-normal
                  md:max-w-[35%] md:min-w-[35%]
                "
              >
                <span class="font-medium text-foreground">{{ getCitationSourceName(citation) }} {{ index + 1 }}</span>
                <span
                  class="
                    line-clamp-2 max-w-full font-extralight
                    text-muted-foreground
                  "
                >{{
                  citation.payload.content?.description || citation.payload.text }}</span>
              </Button>
            </div>

            <!-- Follow-up questions -->
            <div
              v-if="message.followUpQuestions && message.followUpQuestions.length > 0 || message.isLoadingFollowUpQuestions"
            >
              <div class="mt-4 flex items-center gap-2 text-xl font-medium">
                <HelpCircle size="20" />
                Related questions
              </div>
              <div class="mt-4 space-y-2">
                <!-- Skeleton loaders for follow-up questions -->
                <template v-if="message.isLoadingFollowUpQuestions">
                  <Skeleton v-for="i in 4" :key="i" class="mb-2 h-10" />
                </template>

                <!-- Actual follow-up questions when loaded -->
                <template v-else>
                  <Button
                    @click="messageInput = question; sendMessage()"
                    v-for="(question, index) in message.followUpQuestions"
                    :key="index"
                    variant="outline"
                    class="
                      group h-auto min-h-10 w-full justify-start bg-secondary
                      py-2 text-left text-xs font-normal whitespace-break-spaces
                      sm:text-sm
                    "
                  >
                    {{ question }}
                  </Button>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Input Area -->
        <div
          class="
            fixed inset-x-0 bottom-6 z-50 mx-auto w-full max-w-(--breakpoint-md)
            px-2 text-foreground
            sm:px-4
          "
        >
          <div class="rounded-md">
            <div
              class="
                flex flex-col space-y-2 p-2
                sm:flex-row sm:space-y-0 sm:space-x-2
              "
            >
              <VanishingInput
                @submit="sendMessage"
                @change="(event) => messageInput = event.target.value"
                v-model="messageInput"
                :placeholders="placeholders"
                :disabled="isWaitingForResponse"
                class="w-full border"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Citation Dialog -->
    <Dialog v-model:open="showCitationDialog">
      <DialogContent class="max-w-2xl">
        <DialogHeader>
          <DialogTitle class="max-w-lg truncate">
            {{ citationData.title || 'Citation' }}
          </DialogTitle>
          <DialogDescription>
            {{ citationData.summary || 'No summary available' }}
          </DialogDescription>
          <DialogFooter>
            <div
              v-if="citationData.isLoadingFile"
              class="mt-2 flex items-center gap-1 text-xs"
            >
              <span>Loading file...</span>
            </div>
            <Button
              @click="openMarkdownViewer"
              v-else-if="citationData.fileUrl"
              variant="outline"
              size="sm"
              class="mt-2"
            >
              <span>View Document</span>
            </Button>
            <div
              v-else
              class="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
            >
              <i>{{ citationData.title }}</i>
              <span>(File not available)</span>
            </div>
          </DialogFooter>
        </DialogHeader>
      </DialogContent>
    </Dialog>

    <!-- Markdown File Viewer -->
    <MarkdownFileViewer
      :key="citationData.fileUrl"
      v-model:open="showMarkdownViewer"
      :file-url="citationData.fileUrl"
      :title="citationData.title"
      :summary="citationData.summary"
    />
  </div>
</template>

<script setup>
import { HelpCircle, RefreshCcw } from "lucide-vue-next";
import MarkdownIt from "markdown-it";
import { twMerge } from "tailwind-merge";
import { readFiles } from "@directus/sdk";
import { Skeleton } from "@/components/ui/skeleton";
import { VanishingInput } from "@/components/ui/vanishing-input";
import { Button } from "@/components/ui/button";
import MarkdownFileViewer from "@/components/MarkdownFileViewer.vue";

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
  // Add target="_blank" to each link
  tokens[idx].attrPush([ "target", "_blank" ]);
  tokens[idx].attrPush([ "rel", "noopener noreferrer" ]);

  // Pass rendering to default renderer
  return defaultRender(tokens, idx, options, env, self);
};

const { client, createConversation } = useR2R();

const isOpen = ref(false);
const isWaitingForResponse = ref(false);
const messagesContainer = ref(null);
const messageInput = ref("");
const showCitationDialog = ref(false);
const showMarkdownViewer = ref(false);
const citationData = ref({
  id: "",
  documentId: "",
  title: "",
  summary: "",
  fileUrl: "",
  isLoadingFile: false,
});
const messages = ref([]);
const searchResults = ref([]);

// Track conversation ID for the current chat session
const conversationId = ref(null);

// Store scroll states for citation containers
const scrollStates = ref({});

// Add a state variable for tracking if user has manually scrolled
const userHasScrolled = ref(false);
// Track if we should force scroll (e.g. new user message)
const forceScroll = ref(false);
// Track the last known scroll position
const lastScrollPosition = ref(0);

// Add a state variable for storing the last conversation summary
const lastConversationSummary = ref("");

// Add a state variable for storing follow-up questions
const followUpQuestions = ref([]);

// Fetch initial questions on the server side
const { data: initialQuestions } = await useFetch("/api/getInitialQuestions", {
  default: () => [],
});

// Function to fetch file data from Directus
async function fetchFileData(r2rId) {
  const { directus } = useDirectus();
  try {
    const response = await directus.request(
      readFiles({
        filter: {
          r2r_id: {
            _eq: r2rId,
          },
        },
        fields: [ "filename_disk", "filename_download", "id", "storage" ],
        limit: 1,
      }),
    );

    if (response && response.length > 0) {
      const file = response[0];
      // Construct the file URL - this might need to be adjusted based on your Directus setup
      const fileUrl = `/assets/${file.id}`;
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
  if (forceScroll.value) {
    scrollToBottom();
    // Reset force scroll after it's been applied
    forceScroll.value = false;
  }
}, { deep: true });

// Watch for when the chat is opened
watch(isOpen, async (newValue) => {
  if (newValue === true) {
    // Force scroll to bottom when chat is opened
    forceScroll.value = true;
    scrollToBottom();
    // Add a second attempt with a delay to ensure it scrolls after animations
    setTimeout(() => {
      scrollToBottom();
    }, 300);
  }
});

// Add event listener for citation clicks and scroll events
onMounted(() => {
  // Use document-level event delegation to catch all citation clicks
  document.addEventListener("click", handleCitationClick);

  // Add scroll event listener to detect manual scrolling
  window.addEventListener("scroll", handleScroll);
  // Store initial scroll position
  lastScrollPosition.value = window.scrollY;
});

onUnmounted(() => {
  // Remove the document-level event listener
  document.removeEventListener("click", handleCitationClick);

  // Remove scroll event listener
  window.removeEventListener("scroll", handleScroll);
});

// Handle scroll events to detect manual scrolling
function handleScroll() {
  const currentScrollPos = window.scrollY;
  const viewportHeight = window.innerHeight;
  const documentHeight = document.body.scrollHeight;

  // If we're at the bottom, user is not considered to be manually scrolled up
  if (currentScrollPos + viewportHeight >= documentHeight - 50) {
    userHasScrolled.value = false;
  } else if (currentScrollPos < lastScrollPosition.value) {
    // If user is scrolling up (current position is less than last known position)
    userHasScrolled.value = true;
  }

  // Update last known scroll position
  lastScrollPosition.value = currentScrollPos;
}

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
          event.preventDefault();
          return;
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
          event.preventDefault();
        }
      }
    }
  }
}

// Reset chat and start a new conversation
function resetChat() {
  messages.value = [];
  conversationId.value = null;
  searchResults.value = [];
}

function scrollToBottom() {
  nextTick(() => {
    // Only reset userHasScrolled if we're forcing the scroll
    if (forceScroll.value) {
      userHasScrolled.value = false;
    }

    // Don't scroll if user has manually scrolled up unless forced
    if (userHasScrolled.value && !forceScroll.value) {
      return;
    }

    // Scroll the window to the bottom of the page
    window.scrollTo({
      top: document.body.scrollHeight,
      behavior: "smooth",
    });

    // Add a second attempt with a slight delay to ensure scrolling works
    setTimeout(() => {
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: "smooth",
      });
      lastScrollPosition.value = window.scrollY;
    }, 100);
  });
}

function sendMessage() {
  if (!messageInput.value.trim() || isWaitingForResponse.value) return;
  isWaitingForResponse.value = true;

  // Always force scroll when sending a new message
  forceScroll.value = true;

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

  // Create a new conversation if one doesn't exist
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

        // Prepare the query with the previous summary if available
        const queryWithContext = lastConversationSummary.value
          ? `Previous conversation summary: ${lastConversationSummary.value}\n\nNew question: ${userQuery}`
          : `${userQuery}`;

        // Make the API call
        const streamingResponse = await client.retrieval.rag({
          query: queryWithContext,
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
          conversationId: convoId,
          ragGenerationConfig: {
            stream: true,
            temperature: 0.1,
            topP: 1,
            maxTokensToSample: 1024,
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
                let parsedData;

                try {
                  parsedData = JSON.parse(eventData);
                } catch (parseError) {
                  // Log the error but avoid crashing
                  console.error(`JSON parse error for ${eventType} event: ${parseError.message}`);

                  // For search_results specifically, try to recover or skip without crashing
                  if (eventType === "search_results") {
                    console.warn("Skipping malformed search_results event");
                    continue;
                  }

                  // For other events, rethrow to be caught by the outer try-catch
                  throw parseError;
                }

                let deltaText;
                let existingCitationIndex, citationNumber;

                switch (eventType) {
                  case "search_results":
                    console.log("Search results received!");
                    // Store search results
                    if (parsedData && parsedData.data) {
                      searchResults.value = parsedData.data;
                      messages.value = messages.value.map(msg =>
                        msg.id === currentResponseId
                          ? { ...msg, text: "Finding relevant information...", searchResults: parsedData.data }
                          : msg,
                      );
                    } else {
                      console.warn("Received search_results event with missing data property");
                    }
                    break;

                  case "message":
                    if (parsedData.delta && parsedData.delta.content) {
                      // Extract message content
                      deltaText = parsedData.delta.content[0]?.payload?.value || "";
                      console.log("Received message delta:", deltaText);
                      responseText += deltaText;

                      // Update the message in the UI
                      messages.value = messages.value.map(msg =>
                        msg.id === currentResponseId
                          ? { ...msg, text: md.render(responseText) }
                          : msg,
                      );

                      // Scroll to bottom as content comes in
                      if (!userHasScrolled.value) {
                        scrollToBottom();
                      }
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

                    // Create a summary of the last 2 messages (user message and R2R response)
                    try {
                      const lastUserMessage = messages.value.find(m => m.isUser)?.text || "";
                      const aiResponseText = responseText;

                      // Show loading state for the most recent AI message
                      for (let i = messages.value.length - 1; i >= 0; i--) {
                        if (!messages.value[i].isUser) {
                          messages.value[i] = {
                            ...messages.value[i],
                            isLoadingFollowUpQuestions: true,
                          };
                          break;
                        }
                      }

                      // Run both API calls in parallel
                      const [ summaryResponse, followUpResponse ] = await Promise.all([
                        // Summarize conversation
                        $fetch("/api/summarize", {
                          method: "POST",
                          body: {
                            userMessage: lastUserMessage,
                            aiResponse: aiResponseText,
                          },
                        }),
                        // Generate follow-up questions
                        $fetch("/api/followupQuestions", {
                          method: "POST",
                          body: {
                            userMessage: lastUserMessage,
                            aiResponse: aiResponseText,
                          },
                        }),
                      ]);

                      // Process summary response
                      if (summaryResponse.status === "success") {
                        console.log("Conversation summary:", summaryResponse.summary);
                        // Store the summary to use for the next message
                        lastConversationSummary.value = summaryResponse.summary;
                      } else {
                        console.error("Failed to generate summary:", summaryResponse.error);
                      }

                      // Process follow-up questions response
                      if (followUpResponse.status === "success") {
                        console.log("Follow-up questions:", followUpResponse.questions);
                        followUpQuestions.value = followUpResponse.questions;

                        // Attach follow-up questions to the most recent system message
                        // Find the last system message by looking from the end of the array
                        for (let i = messages.value.length - 1; i >= 0; i--) {
                          if (!messages.value[i].isUser) {
                            messages.value[i] = {
                              ...messages.value[i],
                              followUpQuestions: followUpResponse.questions,
                              isLoadingFollowUpQuestions: false, // Turn off loading state
                            };
                            break; // Stop after updating the most recent message
                          }
                        }
                      } else {
                        console.error("Failed to generate follow-up questions:", followUpResponse.error);
                        // Turn off loading state even if there was an error
                        for (let i = messages.value.length - 1; i >= 0; i--) {
                          if (!messages.value[i].isUser) {
                            messages.value[i] = {
                              ...messages.value[i],
                              isLoadingFollowUpQuestions: false,
                            };
                            break;
                          }
                        }
                      }
                    } catch (error) {
                      console.error("Error in parallel API calls:", error);
                      // Turn off loading state in case of error
                      for (let i = messages.value.length - 1; i >= 0; i--) {
                        if (!messages.value[i].isUser) {
                          messages.value[i] = {
                            ...messages.value[i],
                            isLoadingFollowUpQuestions: false,
                          };
                          break;
                        }
                      }
                      // Ensure the input is enabled even if parallel API calls fail
                      isWaitingForResponse.value = false;
                    }

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
                // Make sure input is enabled even if parsing fails
                isWaitingForResponse.value = false;
              }
            }
          }
        }

        // Reset waiting state after processing all events
        isWaitingForResponse.value = false;
      } catch (error) {
        console.error("Error in R2R RAG request:", error);

        // Add error message to chat
        messages.value.push({
          id: Date.now() + 3,
          text: `⚠️ Error: ${error.message || "Failed to get a response. Please try again."}`,
          isUser: false,
          timestamp: new Date(),
        });

        // Ensure input is enabled after RAG request error
        isWaitingForResponse.value = false;
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

async function showCitationDetails(citation) {
  // Show citation data in the dialog
  citationData.value = {
    id: citation.id,
    documentId: citation.payload.document_id || "",
    title: citation.payload.text
      ? `${citation.payload.text.substring(0, 100)}...`
      : (citation.payload.content?.name || "Citation"),
    summary: citation.payload.text || citation.payload.content?.description || "No content available",
    fileUrl: "",
    isLoadingFile: true,
  };
  showCitationDialog.value = true;
  console.log("Showing citation details:", citation.id);

  // Fetch file data from Directus if we have a document ID
  if (citation.payload.document_id) {
    try {
      const fileData = await fetchFileData(citation.payload.document_id);
      if (fileData) {
        citationData.value.fileUrl = fileData.fileUrl;
      }
    } catch (error) {
      console.error("Error fetching file data:", error);
    } finally {
      citationData.value.isLoadingFile = false;
    }
  } else {
    citationData.value.isLoadingFile = false;
  }
}

function openMarkdownViewer() {
  if (!citationData.value.fileUrl) {
    console.error("No file URL available");
    return;
  }

  // Close the citation dialog and open the markdown viewer
  showCitationDialog.value = false;
  showMarkdownViewer.value = true;
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

// Handle horizontal scrolling with vertical mouse wheel
function handleCitationWheel(event) {
  const container = event.currentTarget;
  // Use deltaY for horizontal scrolling - adjust the scroll speed with the multiplier
  const scrollAmount = event.deltaY * 0.8;
  container.scrollLeft += scrollAmount;

  // Update scroll state after scrolling
  handleCitationScroll({ target: container });
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

// Define page metadata for server-side rendering
definePageMeta({
  name: "library",
});
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
}

.markdown-content :deep(ul),
.markdown-content :deep(ol) {
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

.markdown-content :deep(th),
.markdown-content :deep(td) {
  border: 1px solid #4b5563;
  padding: 0.4rem;
}

.light .markdown-content :deep(th),
.light .markdown-content :deep(td) {
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
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.light .markdown-content :deep(sup) {
  background-color: rgba(0, 0, 0, 0.1);
  color: #000;
}

.markdown-content :deep(sup:hover) {
  background-color: rgba(255, 255, 255, 0.3);
}

.light .markdown-content :deep(sup:hover) {
  background-color: rgba(0, 0, 0, 0.2);
}

.hide-scrollbar {
  -ms-overflow-style: none;
  /* IE and Edge */
  scrollbar-width: none;
  /* Firefox */
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
  /* Chrome, Safari and Opera */
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
