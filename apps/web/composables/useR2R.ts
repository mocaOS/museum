import { r2rClient as R2RClient } from "r2r-js";
import { onMounted, useRuntimeConfig } from "#imports";

let r2rInstance: R2RClient | null = null;
// Track authentication state
let isAuthenticated = false;

/**
 * Composable for interacting with the R2R (Retrieval-Augmented Generation) client
 * @returns R2R client instance and utility methods
 */
export function useR2R() {
  const config = useRuntimeConfig();
  const r2rConfig = config.public?.r2r as any | undefined;

  const r2rUrl = r2rConfig?.url || "http://localhost:7272";
  const r2rApiKey = r2rConfig?.apiKey || "";

  // Create a singleton instance of the R2R client
  if (!r2rInstance) {
    r2rInstance = new R2RClient(r2rUrl);
    r2rInstance.setApiKey(r2rApiKey);
  }

  // Authenticate with R2R using API key
  const authenticate = async () => {
    try {
      if (!r2rApiKey) {
        console.error("R2R API key not configured");
        isAuthenticated = false;
        return false;
      }

      // Set the API key in the client configuration
      // For now, we'll verify we can communicate with the API
      // by making a simple request
      try {
        // Simple check - list documents to verify connection
        await r2rInstance.documents.list({
          limit: 1,
        });
        isAuthenticated = true;
        return true;
      } catch (error) {
        console.error("R2R connection check failed:", error);
        isAuthenticated = false;
        return false;
      }
    } catch (error) {
      console.error("R2R authentication failed:", error);
      isAuthenticated = false;
      return false;
    }
  };

  // Ensure authentication before operations
  const ensureAuthenticated = async () => {
    if (!isAuthenticated) {
      return await authenticate();
    }
    return isAuthenticated;
  };

  // Ingest files to R2R
  const ingestFiles = async (files: Array<{ path: string; name: string }>, metadata = {}) => {
    try {
      await ensureAuthenticated();

      const results = [];
      for (const file of files) {
        const documentResult = await r2rInstance.documents.create({
          file,
          metadata: { title: file.name, ...metadata },
        });
        results.push(documentResult);
      }

      return { success: true, results };
    } catch (error) {
      console.error("R2R file ingestion failed:", error);
      throw error;
    }
  };

  // Perform search in R2R
  const search = async (query: string) => {
    try {
      await ensureAuthenticated();
      return await r2rInstance.retrieval.search({ query });
    } catch (error) {
      console.error("R2R search failed:", error);
      throw error;
    }
  };

  // Create a new conversation
  const createConversation = async (title: string) => {
    try {
      await ensureAuthenticated();
      return await r2rInstance.conversations.create({
        name: title || `Conversation ${new Date().toISOString()}`,
      });
    } catch (error) {
      console.error("R2R conversation creation failed:", error);
      throw error;
    }
  };

  // Get conversation by ID
  const getConversation = async (conversationId: string) => {
    try {
      await ensureAuthenticated();
      // Using list with filters as a workaround if direct get is not available
      const response = await r2rInstance.conversations.list({
        ids: [ conversationId ],
      });
      return response.results?.[0];
    } catch (error) {
      console.error("R2R get conversation failed:", error);
      throw error;
    }
  };

  // List conversations
  const listConversations = async (options = {}) => {
    try {
      await ensureAuthenticated();
      return await r2rInstance.conversations.list(options);
    } catch (error) {
      console.error("R2R list conversations failed:", error);
      throw error;
    }
  };

  // Perform RAG with R2R
  const rag = async (options: {
    query: string;
    use_vector_search?: boolean;
    filters?: Record<string, any>;
    search_limit?: number;
    use_hybrid_search?: boolean;
    use_kg_search?: boolean;
    kg_generation_config?: Record<string, any>;
    rag_generation_config?: {
      model?: string;
      temperature?: number;
      stream?: boolean;
    };
    conversation_id?: string; // Added conversation_id support
  }) => {
    try {
      await ensureAuthenticated();

      // If we have a conversation ID, use it to create a context-aware query
      const contextAwareQuery = options.query;
      if (options.conversation_id) {
        // Log the conversation ID being used
        console.log(`Using conversation ID: ${options.conversation_id} for query`);

        // Add conversation ID to filters if needed
        if (!options.filters) {
          options.filters = {};
        }
        options.filters.conversation_id = options.conversation_id;
      }

      // Format options correctly for the retrieval.rag method
      const ragOptions = {
        query: contextAwareQuery,
        searchSettings: {
          limit: options.search_limit || 4,
          use_vector_search: options.use_vector_search,
          filters: options.filters,
          use_hybrid_search: options.use_hybrid_search,
          use_kg_search: options.use_kg_search,
          kg_generation_config: options.kg_generation_config,
          rag_generation_config: options.rag_generation_config,
        },
      };

      return await r2rInstance.retrieval.rag(ragOptions);
    } catch (error) {
      console.error("R2R RAG failed:", error);
      throw error;
    }
  };

  // Initialize authentication on client side
  onMounted(() => {
    if (!isAuthenticated) {
      ensureAuthenticated();
    }
  });

  return {
    client: r2rInstance,
    authenticate,
    isAuthenticated: () => isAuthenticated,
    ingestFiles,
    search,
    rag,
    createConversation,
    getConversation,
    listConversations,
  };
}
