import { appendFile } from "node:fs/promises";
import {
  Action,
  IAgentRuntime,
  Memory,
  ModelType,
  Plugin,
  Provider,
  Service,
  State,
} from "@elizaos/core";
import { r2rClient as R2RClient } from "r2r-js";

interface R2RSearchOptions {
  query: string;
  useVectorSearch?: boolean;
  useHybridSearch?: boolean;
  useSemanticSearch?: boolean;
  filters?: Record<string, any>;
  limit?: number;
  chunkSettings?: {
    indexMeasure?: string;
    enabled?: boolean;
  };
  graphSettings?: {
    enabled?: boolean;
  };
}

interface R2RRAGOptions extends R2RSearchOptions {
  ragGenerationConfig?: {
    model?: string;
    temperature?: number;
    topP?: number;
    maxTokensToSample?: number;
    stream?: boolean;
  };
  conversationId?: string;
}

interface R2RSearchResult {
  id: string;
  payload: {
    text: string;
    document_id?: string;
    content?: {
      description?: string;
      source?: string;
      name?: string;
    };
  };
}

interface R2RRAGResponse {
  completion: string;
  search_results?: R2RSearchResult[];
  citations?: R2RSearchResult[];
}

/**
 * Service for interacting with R2R (Retrieval-Augmented Generation) backend
 */
export class R2RService extends Service {
  static serviceType = "r2r-service";
  capabilityDescription
    = "Provides RAG (Retrieval-Augmented Generation) capabilities using R2R backend";

  private client: R2RClient;
  private baseUrl: string;
  private apiKey: string;
  private isAuthenticated: boolean = false;
  private currentConversationId: string | null = null;
  private static readonly LOG_FILE_PATH
    = "/Volumes/WD_BLACK/PROJECTS/MOCA/moca-migration/apps/moca-agent/src/plugins/log.txt";

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    this.baseUrl = process.env.R2R_URL || "http://localhost:7272";
    this.apiKey = process.env.R2R_API_KEY || "";
    this.client = new R2RClient(this.baseUrl);

    if (this.apiKey) {
      this.client.setApiKey(this.apiKey);
    }
  }

  static async start(runtime: IAgentRuntime): Promise<R2RService> {
    const service = new R2RService(runtime);

    // Initialize and test connection
    try {
      await service.initialize();
      runtime.logger?.info("R2R Service started successfully");
    } catch (error) {
      runtime.logger?.error(
        `Failed to start R2R Service - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    return service;
  }

  async stop(): Promise<void> {
    this.runtime?.logger?.info("R2R Service stopped");
  }

  /**
   * Initialize the R2R service
   */
  private async initialize(): Promise<void> {
    try {
      // Test connection
      const isHealthy = await this.testConnection();
      this.runtime?.logger?.info(`R2R health check - IsHealthy: ${isHealthy}`);

      // Authenticate if API key is provided
      if (this.apiKey) {
        this.isAuthenticated = true;
        this.runtime?.logger?.info("R2R authenticated with API key");
      } else {
        this.runtime?.logger?.warn(
          "No R2R API key provided, some features may be limited",
        );
      }
    } catch (error) {
      this.runtime?.logger?.error(
        `Failed to initialize R2R service - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(
        `R2R initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Test connection to R2R
   */
  async testConnection(): Promise<boolean> {
    try {
      // Use a simple request to test the connection
      const response = await fetch(`${this.baseUrl}/v3/health`);
      return response.ok;
    } catch (error) {
      this.runtime?.logger?.error(
        `R2R connection test failed - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Create a new conversation
   */
  async createConversation(title?: string): Promise<string> {
    try {
      const conversationTitle
        = title || `Chat Session ${new Date().toLocaleString()}`;
      const response = await this.client.conversations.create({
        name: conversationTitle,
      });

      const conversationId = response.results?.id;
      if (!conversationId) {
        throw new Error("Failed to get conversation ID from response");
      }

      this.currentConversationId = conversationId;
      this.runtime?.logger?.info(
        `Created R2R conversation - ID: ${conversationId}, Title: ${conversationTitle}`,
      );

      return conversationId;
    } catch (error) {
      this.runtime?.logger?.error(
        `Failed to create R2R conversation - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get or create conversation ID
   */
  async getOrCreateConversationId(title?: string): Promise<string> {
    if (this.currentConversationId) {
      return this.currentConversationId;
    }
    return await this.createConversation(title);
  }

  /**
   * Perform semantic search
   */
  async search(options: R2RSearchOptions): Promise<R2RSearchResult[]> {
    try {
      const searchConfig = {
        query: options.query,
        useHybridSearch: options.useHybridSearch || false,
        useSemanticSearch: options.useSemanticSearch !== false, // Default to true
        filters: options.filters || {},
        limit: options.limit || 10,
        chunkSettings: options.chunkSettings || {
          indexMeasure: "cosine_distance",
          enabled: true,
        },
        graphSettings: options.graphSettings || {
          enabled: true,
        },
      };

      this.runtime?.logger?.debug(
        `R2R search request - Config: ${JSON.stringify(searchConfig)}`,
      );

      const response = await this.client.retrieval.search(searchConfig);

      // Extract results from the response
      const results = Array.isArray(response?.results?.chunkSearchResults)
        ? response.results.chunkSearchResults.map((result: any) => ({
          id: result.id || `${Date.now()}-${Math.random()}`,
          payload: {
            text: result.metadata?.text || result.text || "",
            document_id: result.document_id,
            content: {
              description: result.metadata?.text || result.text || "",
              source: result.metadata?.source || "Unknown source",
              name:
                  result.metadata?.title
                  || result.metadata?.filename
                  || "Untitled",
            },
          },
        }))
        : [];

      this.runtime?.logger?.debug(
        `R2R search response - ResultCount: ${results.length}, Query: "${options.query}"`,
      );

      await this.logR2REvent("search", {
        request: {
          query: options.query,
          filters: searchConfig.filters,
          limit: searchConfig.limit,
          useHybridSearch: searchConfig.useHybridSearch,
          useSemanticSearch: searchConfig.useSemanticSearch,
        },
        response: {
          resultCount: results.length,
          topSources: results
            .slice(0, 3)
            .map(
              r =>
                r.payload.content?.name
                || r.payload.content?.source
                || "Unknown source",
            ),
        },
      });

      return results;
    } catch (error) {
      this.runtime?.logger?.error(
        `R2R search failed - Options: ${JSON.stringify(options)}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.logR2REvent("search", {
        request: {
          query: options.query,
          filters: options.filters,
          limit: options.limit,
        },
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Perform RAG (Retrieval-Augmented Generation)
   */
  async rag(options: R2RRAGOptions): Promise<R2RRAGResponse> {
    try {
      const conversationId
        = options.conversationId || (await this.getOrCreateConversationId());

      const ragConfig = {
        query: options.query,
        searchSettings: {
          useHybridSearch: options.useHybridSearch || false,
          useSemanticSearch: options.useSemanticSearch !== false,
          filters: options.filters || {},
          limit: options.limit || 4,
          chunkSettings: options.chunkSettings || {
            indexMeasure: "cosine_distance",
            enabled: true,
          },
          graphSettings: options.graphSettings || {
            enabled: true,
          },
        },
        conversationId,
        ragGenerationConfig: {
          stream: false, // We'll handle non-streaming for simplicity
          temperature: 0.1,
          topP: 1,
          maxTokensToSample: 1024,
          ...options.ragGenerationConfig,
        },
      };

      this.runtime?.logger?.debug(
        `R2R RAG request - Query: "${options.query}", ConversationID: ${conversationId}, Config: ${JSON.stringify(ragConfig)}`,
      );

      const response = await this.client.retrieval.rag(ragConfig);

      // Extract the completion and search results from response
      const completion
        = response?.results?.completion?.choices?.[0]?.message?.content
        || response?.results?.completion
        || "";
      const rawSearchResults
        = response?.results?.searchResults?.chunkSearchResults || [];

      // Transform search results to match our interface
      const searchResults = Array.isArray(rawSearchResults)
        ? rawSearchResults.map((result: any) => ({
          id: result.id || `${Date.now()}-${Math.random()}`,
          payload: {
            text: result.metadata?.text || result.text || "",
            document_id: result.document_id,
            content: {
              description: result.metadata?.text || result.text || "",
              source: result.metadata?.source || "Unknown source",
              name:
                  result.metadata?.title
                  || result.metadata?.filename
                  || "Untitled",
            },
          },
        }))
        : [];

      this.runtime?.logger?.debug(
        `R2R RAG response - HasCompletion: ${!!completion}, SearchResultCount: ${searchResults.length}, Query: "${options.query}"`,
      );

      await this.logR2REvent("rag", {
        request: {
          query: options.query,
          conversationId,
          searchSettings: ragConfig.searchSettings,
          ragGenerationConfig: ragConfig.ragGenerationConfig,
        },
        response: {
          hasCompletion: !!completion,
          completionPreview:
            typeof completion === "string" ? completion.slice(0, 300) : "",
          searchResultCount: searchResults.length,
          topSources: searchResults
            .slice(0, 3)
            .map(
              r =>
                r.payload.content?.name
                || r.payload.content?.source
                || "Unknown source",
            ),
        },
      });

      return {
        completion,
        search_results: searchResults,
        citations: searchResults, // Use search results as citations for now
      };
    } catch (error) {
      this.runtime?.logger?.error(
        `R2R RAG failed - Options: ${JSON.stringify(options)}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      await this.logR2REvent("rag", {
        request: {
          query: options.query,
          conversationId: options.conversationId,
        },
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Format search results for display
   */
  formatSearchResultsForDisplay(results: R2RSearchResult[]): string {
    if (results.length === 0) {
      return "No search results found.";
    }

    return results
      .slice(0, 3)
      .map((result, index) => {
        const text
          = result.payload.text?.substring(0, 200) || "No content available";
        const source
          = result.payload.content?.source
          || result.payload.content?.name
          || "Unknown source";

        return `${index + 1}. **${source}**\n${text}${text.length >= 200 ? "..." : ""}`;
      })
      .join("\n\n");
  }

  /**
   * Generate AI-powered comprehensive response using ElizaOS language model
   */
  async generateAIResponse(
    ragResponse: R2RRAGResponse,
    originalQuery: string,
    runtime: IAgentRuntime,
  ): Promise<string> {
    try {
      // If we have a good completion from R2R, enhance it with AI
      if (ragResponse.completion && ragResponse.completion.trim().length > 50) {
        const enhancedResponse = await this.enhanceWithAI(
          ragResponse.completion,
          originalQuery,
          ragResponse.search_results || [],
          runtime,
        );
        return this.addSourceCitations(
          enhancedResponse,
          ragResponse.search_results || [],
        );
      }

      // If no completion or poor completion, generate from search results
      if (ragResponse.search_results && ragResponse.search_results.length > 0) {
        const generatedResponse = await this.generateFromSearchResults(
          originalQuery,
          ragResponse.search_results,
          runtime,
        );
        return this.addSourceCitations(
          generatedResponse,
          ragResponse.search_results,
        );
      }

      return "I couldn't find relevant information to answer your question. Please try rephrasing or asking about a different topic.";
    } catch (error) {
      this.runtime?.logger?.error(
        `Error generating AI response - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback to original completion or basic synthesis
      if (ragResponse.completion && ragResponse.completion.trim().length > 0) {
        return ragResponse.completion.trim();
      }

      if (ragResponse.search_results && ragResponse.search_results.length > 0) {
        return this.synthesizeResponseFromSearchResults(
          ragResponse.search_results,
          originalQuery,
        );
      }

      return "I found some relevant information but encountered an issue generating a comprehensive response. Please try rephrasing your question.";
    }
  }

  /**
   * Enhance existing R2R completion with AI
   */
  private async enhanceWithAI(
    completion: string,
    query: string,
    searchResults: R2RSearchResult[],
    runtime: IAgentRuntime,
  ): Promise<string> {
    const contextSummary = this.createContextSummary(searchResults);

    const prompt
      = "You are an expert assistant specializing in MOCA and crypto art. Enhance the following response with additional context and details.\n\n"
      + `Original Question: "${query}"\n\n`
      + `Current Response: "${completion}"\n\n`
      + `Additional Context: ${contextSummary}\n\n`
      + "Instructions: Enhance the response by adding relevant details, improving clarity, and ensuring completeness. Keep the same tone and style. Do not mention that you're enhancing anything.\n\n"
      + "Enhanced Response:";

    const enhanced = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      temperature: 0.1,
      maxTokens: 1200,
    });

    return enhanced.trim();
  }

  /**
   * Generate response from search results using AI
   */
  private async generateFromSearchResults(
    query: string,
    searchResults: R2RSearchResult[],
    runtime: IAgentRuntime,
  ): Promise<string> {
    const contextSummary = this.createContextSummary(searchResults);

    const prompt
      = "You are an expert assistant specializing in MOCA and crypto art. Answer the user's question using the provided context.\n\n"
      + `Question: "${query}"\n\n`
      + `Available Information: ${contextSummary}\n\n`
      + "Instructions: Provide a comprehensive, helpful answer based on the available information. Be informative and conversational. If information is limited, be honest about what you can determine.\n\n"
      + "Answer:";

    const response = await runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
      temperature: 0.1,
      maxTokens: 1200,
    });

    return response.trim();
  }

  /**
   * Create a concise summary of search results for AI context
   */
  private createContextSummary(results: R2RSearchResult[]): string {
    if (results.length === 0) {
      return "No additional context available.";
    }

    const summaries = results.slice(0, 4).map((result, index) => {
      const source
        = result.payload.content?.name
        || result.payload.content?.source
        || "Unknown source";
      const text = result.payload.text || "No content available";
      const snippet = text.substring(0, 300).replace(/\n+/g, " ").trim();

      return `${index + 1}. From "${source}": ${snippet}${text.length > 300 ? "..." : ""}`;
    });

    return summaries.join("\n\n");
  }

  /**
   * Add source citations to a response
   */
  private addSourceCitations(
    response: string,
    searchResults: R2RSearchResult[],
  ): string {
    if (searchResults.length === 0) {
      return response;
    }

    const citations = searchResults
      .slice(0, 3)
      .map((result, index) => {
        const source
          = result.payload.content?.name
          || result.payload.content?.source
          || "Unknown source";
        return `${index + 1}. ${source}`;
      })
      .join("\n");

    return `${response}\n\n**Sources:**\n${citations}`;
  }

  /**
   * Generate AI-powered search summary using ElizaOS language model
   */
  async generateSearchSummary(
    searchResults: R2RSearchResult[],
    query: string,
    runtime: IAgentRuntime,
  ): Promise<string> {
    try {
      if (searchResults.length === 0) {
        return `I couldn't find any documents matching "${query}". Try using different keywords or phrases.`;
      }

      const contextSummary = this.createContextSummary(searchResults);

      const prompt
        = "You are an expert assistant helping users find information. Summarize what was found for the user's search.\n\n"
        + `Search Query: "${query}"\n\n`
        + `Found Information: ${contextSummary}\n\n`
        + "Instructions: Provide a helpful summary of what was found. Highlight key findings and explain how they relate to the search query. Be conversational and informative.\n\n"
        + "Summary:";

      const aiSummary = await runtime.useModel(ModelType.TEXT_LARGE, {
        prompt,
        temperature: 0.2,
        maxTokens: 1024,
      });

      return aiSummary.trim();
    } catch (error) {
      this.runtime?.logger?.error(
        `Error generating AI search summary - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Fallback to traditional formatting
      const detailedResults = this.formatDetailedSources(searchResults);
      return `I found ${searchResults.length} document${searchResults.length !== 1 ? "s" : ""} matching "${query}":\n\n${detailedResults}`;
    }
  }

  /**
   * Synthesize a response from search results when completion is insufficient
   */
  private synthesizeResponseFromSearchResults(
    results: R2RSearchResult[],
    query: string,
  ): string {
    if (results.length === 0) {
      return "I couldn't find specific information to answer your question.";
    }

    // Combine key information from top results
    const keyPoints: string[] = [];
    const sources: Set<string> = new Set();

    for (const result of results.slice(0, 3)) {
      const text = result.payload.text || "";
      const source
        = result.payload.content?.name
        || result.payload.content?.source
        || "Unknown source";

      if (text.length > 30) {
        // Extract the most relevant sentence or paragraph
        const sentences = text
          .split(/[.!?]+/)
          .filter(s => s.trim().length > 20);
        const relevantSentence
          = sentences.find(
            s =>
              s.toLowerCase().includes(query.toLowerCase().split(" ")[0])
              || s.length > 50,
          ) || sentences[0];

        if (
          relevantSentence
          && !keyPoints.some(point => point.includes(relevantSentence.trim()))
        ) {
          keyPoints.push(relevantSentence.trim());
          sources.add(source);
        }
      }
    }

    let synthesizedResponse = `Based on the available information about "${query}":`;

    synthesizedResponse += "\n\n";
    synthesizedResponse += keyPoints
      .map(
        (point, idx) => `${idx + 1}. ${point}${point.endsWith(".") ? "" : "."}`,
      )
      .join("\n\n");

    if (keyPoints.length === 0) {
      synthesizedResponse
        += "\n\nI found relevant documents but need more specific information to provide a detailed answer.";
    }

    return synthesizedResponse;
  }

  /**
   * Format detailed source citations with more information
   */
  formatDetailedSources(results: R2RSearchResult[]): string {
    if (results.length === 0) {
      return "No sources available.";
    }

    return results
      .slice(0, 4)
      .map((result, index) => {
        const source
          = result.payload.content?.name
          || result.payload.content?.source
          || "Unknown source";
        const description
          = result.payload.content?.description
          || result.payload.text?.substring(0, 150)
          || "";
        const documentId = result.payload.document_id;

        let citation = `${index + 1}. **${source}**`;

        if (description && description.length > 10) {
          const cleanDescription = description.trim();
          citation += `\n   ${cleanDescription}${cleanDescription.length >= 150 ? "..." : ""}`;
        }

        if (documentId) {
          citation += `\n   *Document ID: ${documentId}*`;
        }

        return citation;
      })
      .join("\n\n");
  }

  /**
   * Reset conversation (start a new one)
   */
  resetConversation(): void {
    this.currentConversationId = null;
    this.runtime?.logger?.info("R2R conversation reset");
  }

  private async logR2REvent(
    type: "search" | "rag",
    data: Record<string, any>,
  ): Promise<void> {
    try {
      const entry = {
        timestamp: new Date().toISOString(),
        type,
        ...data,
      };
      await appendFile(R2RService.LOG_FILE_PATH, `${JSON.stringify(entry)}\n`);
    } catch (err) {
      this.runtime?.logger?.error(
        `Failed to append to R2R log file - Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

export const askR2RAction: Action = {
  name: "ASK_R2R",
  description:
    "Ask questions using R2R's retrieval-augmented generation capabilities",
  similes: [
    "ask about",
    "tell me about",
    "what is",
    "explain",
    "describe",
    "how does",
    "search for information about",
    "find information about",
    "query",
    "research",
    "look up",
    "get information about",
    "what do you know about",
    "can you explain",
    "help me understand",
    "give me details about",
    "tell me about moca",
    "about the artist",
    "about this artwork",
    "about crypto art",
    "about digital art",
    "moca collection",
    "genesis collection",
    "moca token",
    "moca dao",
    "moca rooms",
    "art decc0s",
    "museum of crypto art",
    "crypto artist",
    "nft artist",
    "blockchain art",
    "who is the artist",
    "what artwork",
    "which collection",
    "artist background",
    "artwork history",
    "collection details",
    "exhibition info",
    "virtual gallery",
    "ask the library",
    "ask librarian",
    "library",
    "librarian",
    "ask library",
  ],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";

    // Look for question words and information-seeking patterns
    const questionWords = [
      "what",
      "how",
      "why",
      "when",
      "where",
      "who",
      "which",
    ];
    const actionWords = [
      "tell",
      "explain",
      "describe",
      "find",
      "search",
      "look",
      "get",
      "give",
      "show",
    ];
    const informationWords = [
      "information",
      "details",
      "about",
      "regarding",
      "concerning",
    ];

    // MOCA-specific keywords that should trigger R2R
    const mocaKeywords = [
      "moca",
      "museum of crypto art",
      "crypto art",
      "digital art",
      "nft",
      "blockchain art",
      "artist",
      "artwork",
      "collection",
      "genesis",
      "token",
      "dao",
      "rooms",
      "decc0s",
      "exhibition",
      "gallery",
      "virtual",
      "curator",
      "cryptoart",
      "web3 art",
      "moca token",
      "$moca",
      "moca dao",
      "moca rooms",
      "genesis collection",
      "permanent collection",
      "library",
      "librarian",
    ];

    const hasQuestionWord = questionWords.some(word => text.includes(word));
    const hasActionWord = actionWords.some(word => text.includes(word));
    const hasInformationWord = informationWords.some(word =>
      text.includes(word),
    );
    const hasMocaKeyword = mocaKeywords.some(keyword =>
      text.includes(keyword),
    );

    // Check for question patterns
    const isQuestion = text.includes("?") || hasQuestionWord;
    const isInformationRequest = hasActionWord && hasInformationWord;
    const isMocaRelated = hasMocaKeyword;

    // Exclude very short queries or basic greetings
    const greetings = [ "hi", "hello", "hey", "thanks", "thank you" ];
    const isSubstantive = text.length > 10 && !greetings.includes(text.trim());

    const result
      = ((isQuestion || isInformationRequest) && isSubstantive)
      || (isMocaRelated && isSubstantive);

    runtime.logger?.debug(
      `R2R Action Validation - Text: "${text}", HasQuestionWord: ${hasQuestionWord}, HasActionWord: ${hasActionWord}, HasInformationWord: ${hasInformationWord}, HasMocaKeyword: ${hasMocaKeyword}, IsQuestion: ${isQuestion}, IsInformationRequest: ${isInformationRequest}, IsMocaRelated: ${isMocaRelated}, IsSubstantive: ${isSubstantive}, Result: ${result}`,
    );

    return result;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: any,
  ) => {
    try {
      const r2rService = runtime.getService("r2r-service") as R2RService;

      if (!r2rService) {
        const serviceErrorText
          = "R2R service is not available. Please check the configuration.";

        if (callback) {
          await callback({
            text: serviceErrorText,
            action: "ASK_R2R_ERROR",
          });
        }

        return {
          text: serviceErrorText,
          action: "ASK_R2R_ERROR",
          success: false,
        };
      }

      // Test connection first
      const connectionOk = await r2rService.testConnection();
      if (!connectionOk) {
        const connectionErrorText
          = "Unable to connect to the R2R service. Please check if the R2R server is running.";

        if (callback) {
          await callback({
            text: connectionErrorText,
            action: "ASK_R2R_CONNECTION_ERROR",
          });
        }

        return {
          text: connectionErrorText,
          action: "ASK_R2R_CONNECTION_ERROR",
          success: false,
        };
      }

      const query = message.content.text || "";

      // Format the query to be more suitable for RAG
      const formattedQuery = query.trim();

      runtime.logger?.debug(
        `Processing R2R query - OriginalQuery: "${query}", FormattedQuery: "${formattedQuery}"`,
      );

      // Provide immediate feedback to user
      if (callback) {
        await callback({
          text: "Searching for information...",
          action: "ASK_R2R_SEARCHING",
        });
      }

      // Perform RAG query
      const ragResponse = await r2rService.rag({
        query: formattedQuery,
        useSemanticSearch: true,
        useHybridSearch: false,
        limit: 4,
        ragGenerationConfig: {
          temperature: 0.1,
          maxTokensToSample: 1024,
        },
      });

      if (
        !ragResponse.completion
        && (!ragResponse.search_results || ragResponse.search_results.length === 0)
      ) {
        const noResponseText
          = "I couldn't find relevant information to answer your question. Please try rephrasing or asking about a different topic.";

        if (callback) {
          await callback({
            text: noResponseText,
            action: "ASK_R2R_NO_RESPONSE",
          });
        }

        return {
          text: noResponseText,
          action: "ASK_R2R_NO_RESPONSE",
          success: true,
        };
      }

      // Generate AI-powered comprehensive response using ElizaOS language model
      const responseText = await r2rService.generateAIResponse(
        ragResponse,
        formattedQuery,
        runtime,
      );

      if (callback) {
        await callback({
          text: responseText,
          action: "ASK_R2R_SUCCESS",
        });
      }

      return {
        text: responseText,
        action: "ASK_R2R_SUCCESS",
        success: true,
        data: {
          query: formattedQuery,
          completion: ragResponse.completion,
          searchResults: ragResponse.search_results,
          citations: ragResponse.citations,
        },
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in askR2RAction - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorText
        = "I encountered an error while processing your question. Please try again later.";

      if (callback) {
        await callback({
          text: errorText,
          action: "ASK_R2R_ERROR",
        });
      }

      return {
        text: errorText,
        action: "ASK_R2R_ERROR",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "What is the mission of the Museum of Crypto Art?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "The Museum of Crypto Art (MOCA) serves as a pioneering cultural institution dedicated to preserving, collecting, and exhibiting the evolution of crypto art and blockchain-based digital creativity. Founded as the world's first museum focused entirely on crypto art, MOCA plays a crucial role in documenting and educating audiences about this revolutionary art movement.\n\nMOCA's mission encompasses several key areas: preserving significant works from crypto art pioneers, providing educational resources about blockchain technology's impact on artistic expression, and creating platforms for both established and emerging crypto artists to showcase their work. The museum operates both virtually and physically, making crypto art accessible to global audiences while maintaining the technological authenticity that defines the medium.\n\nThrough its various initiatives, MOCA has become a central hub for the crypto art community, fostering connections between artists, collectors, and enthusiasts while ensuring that this important cultural movement is properly documented for future generations.\n\n**Sources:**\n1. MOCA Mission Statement\n2. Museum Overview Documentation\n3. Crypto Art History Archives",
          action: "ASK_R2R_SUCCESS",
        },
      },
    ],
  ],
};

export const searchR2RAction: Action = {
  name: "SEARCH_R2R",
  description: "Search documents using R2R's semantic search capabilities",
  similes: [
    "search",
    "find",
    "look for",
    "search for",
    "find documents about",
    "search documents",
    "lookup",
    "retrieve",
    "find content",
    "search content",
    "get documents",
    "search moca",
    "find artist",
    "search artist",
    "find artwork",
    "search artwork",
    "find collection",
    "search collection",
    "search crypto art",
    "find crypto art",
    "search digital art",
    "find exhibitions",
    "search exhibitions",
    "find moca rooms",
    "search rooms",
    "find genesis",
    "search genesis",
    "find decc0s",
    "search decc0s",
    "lookup artist",
    "lookup artwork",
    "retrieve artist info",
    "retrieve artwork info",
    "search museum",
    "find museum",
    "decc0s",
    "search library",
    "search the library",
    "find in library",
  ],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";

    const searchKeywords = [
      "search",
      "find",
      "look for",
      "lookup",
      "retrieve",
      "get",
    ];
    const documentKeywords = [
      "document",
      "documents",
      "content",
      "file",
      "files",
      "text",
    ];

    // MOCA-specific search terms
    const mocaSearchTerms = [
      "moca",
      "artist",
      "artwork",
      "collection",
      "crypto art",
      "digital art",
      "nft",
      "genesis",
      "decc0s",
      "rooms",
      "exhibition",
      "gallery",
      "museum",
      "token",
      "dao",
      "library",
      "librarian",
    ];

    const hasSearchKeyword = searchKeywords.some(keyword =>
      text.includes(keyword),
    );
    const hasDocumentKeyword = documentKeywords.some(keyword =>
      text.includes(keyword),
    );
    const hasMocaSearchTerm = mocaSearchTerms.some(term =>
      text.includes(term),
    );

    // Also check for explicit search commands
    const isExplicitSearch
      = text.startsWith("search") || text.includes("search for");
    const isMocaSearch = hasSearchKeyword && hasMocaSearchTerm;
    const isDecc0sQuery = text.includes("decc0s");

    const result
      = (hasSearchKeyword && hasDocumentKeyword)
      || isExplicitSearch
      || isMocaSearch
      || isDecc0sQuery;

    runtime.logger?.debug(
      `R2R Search Action Validation - Text: "${text}", HasSearchKeyword: ${hasSearchKeyword}, HasDocumentKeyword: ${hasDocumentKeyword}, HasMocaSearchTerm: ${hasMocaSearchTerm}, IsExplicitSearch: ${isExplicitSearch}, IsMocaSearch: ${isMocaSearch}, IsDecc0sQuery: ${isDecc0sQuery}, Result: ${result}`,
    );

    return result;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: any,
  ) => {
    try {
      const r2rService = runtime.getService("r2r-service") as R2RService;

      if (!r2rService) {
        const serviceErrorText
          = "R2R service is not available. Please check the configuration.";

        if (callback) {
          await callback({
            text: serviceErrorText,
            action: "SEARCH_R2R_ERROR",
          });
        }

        return {
          text: serviceErrorText,
          action: "SEARCH_R2R_ERROR",
          success: false,
        };
      }

      // Test connection first
      const connectionOk = await r2rService.testConnection();
      if (!connectionOk) {
        const connectionErrorText
          = "Unable to connect to the R2R service. Please check if the R2R server is running.";

        if (callback) {
          await callback({
            text: connectionErrorText,
            action: "SEARCH_R2R_CONNECTION_ERROR",
          });
        }

        return {
          text: connectionErrorText,
          action: "SEARCH_R2R_CONNECTION_ERROR",
          success: false,
        };
      }

      // Extract search query from message
      const fullText = message.content.text || "";
      let searchQuery = fullText;

      // Remove search command words to get the actual query
      const searchPrefixes = [
        "search for",
        "search",
        "find",
        "look for",
        "lookup",
        "retrieve",
        "get",
      ];
      for (const prefix of searchPrefixes) {
        if (searchQuery.toLowerCase().startsWith(prefix)) {
          searchQuery = searchQuery.substring(prefix.length).trim();
          break;
        }
      }

      if (!searchQuery) {
        const noQueryText
          = "Please provide a search query. For example: 'search for information about AI'";

        if (callback) {
          await callback({
            text: noQueryText,
            action: "SEARCH_R2R_NO_QUERY",
          });
        }

        return {
          text: noQueryText,
          action: "SEARCH_R2R_NO_QUERY",
          success: false,
        };
      }

      runtime.logger?.debug(
        `Processing R2R search - OriginalText: "${fullText}", SearchQuery: "${searchQuery}"`,
      );

      // Provide immediate feedback
      if (callback) {
        await callback({
          text: "Searching documents...",
          action: "SEARCH_R2R_SEARCHING",
        });
      }

      // Perform search
      const searchResults = await r2rService.search({
        query: searchQuery,
        useSemanticSearch: true,
        limit: 5,
      });

      if (searchResults.length === 0) {
        const noResultsText = `I couldn't find any documents matching "${searchQuery}". Try using different keywords or phrases.`;

        if (callback) {
          await callback({
            text: noResultsText,
            action: "SEARCH_R2R_NO_RESULTS",
          });
        }

        return {
          text: noResultsText,
          action: "SEARCH_R2R_NO_RESULTS",
          success: true,
        };
      }

      // Generate AI-powered search summary
      const finalResultText = await r2rService.generateSearchSummary(
        searchResults,
        searchQuery,
        runtime,
      );

      if (callback) {
        await callback({
          text: finalResultText,
          action: "SEARCH_R2R_SUCCESS",
        });
      }

      return {
        text: finalResultText,
        action: "SEARCH_R2R_SUCCESS",
        success: true,
        data: {
          query: searchQuery,
          results: searchResults,
          resultCount: searchResults.length,
        },
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in searchR2RAction - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorText
        = "I encountered an error while searching documents. Please try again later.";

      if (callback) {
        await callback({
          text: errorText,
          action: "SEARCH_R2R_ERROR",
        });
      }

      return {
        text: errorText,
        action: "SEARCH_R2R_ERROR",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "Search for documents about MOCA ROOMs" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found comprehensive information about MOCA ROOMs across several documents. MOCA ROOMs represent an innovative approach to virtual art exhibitions, creating immersive digital spaces where crypto art can be experienced in ways that traditional galleries cannot offer.\n\nThese virtual rooms serve as interactive galleries that leverage blockchain technology and virtual reality to create unique viewing experiences. They allow visitors to explore crypto art collections in three-dimensional environments, often incorporating the technological elements that make each piece special. MOCA ROOMs also facilitate community interaction, enabling collectors and artists to gather in shared virtual spaces.\n\nThe documentation covers both the technical infrastructure that powers these virtual spaces and the curatorial philosophy behind their design, showing how MOCA is reimagining what an art museum can be in the digital age.",
          action: "SEARCH_R2R_SUCCESS",
        },
      },
    ],
  ],
};

export const r2rContextProvider: Provider = {
  name: "R2R_CONTEXT_PROVIDER",
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const r2rService = runtime.getService("r2r-service") as R2RService;

      if (!r2rService) {
        return {
          text: "",
          data: {},
        };
      }

      const contextInfo = [
        "R2R (Retrieval-Augmented Generation) Capabilities:",
        "",
        "You can ask me questions and I'll search through available documents to provide informed answers:",
        "- Ask 'What is [topic]?' for explanations",
        "- Ask 'How does [process] work?' for detailed information",
        "- Ask 'Tell me about [subject]' for comprehensive overviews",
        "",
        "You can also search documents directly:",
        "- 'Search for [keywords]' to find relevant documents",
        "- 'Find content about [topic]' to locate specific information",
        "",
        "I use semantic search to understand the meaning of your questions and find the most relevant information from the knowledge base.",
      ];

      return {
        text: contextInfo.join("\n"),
        data: { hasR2RService: true },
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in r2rContextProvider - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        text: "R2R information capabilities are temporarily unavailable.",
        data: { hasR2RService: false },
      };
    }
  },
};

export const r2rRAGPlugin: Plugin = {
  priority: 1000,
  name: "r2r-rag",
  description:
    "Provides retrieval-augmented generation capabilities using R2R backend with AI-powered response generation",

  // Register service
  services: [ R2RService ],

  // Register actions
  actions: [ askR2RAction, searchR2RAction ],

  // Register providers
  providers: [ r2rContextProvider ],

  // Configuration
  config: {
    r2rUrl: process.env.R2R_URL || "http://localhost:7272",
    r2rApiKey: process.env.R2R_API_KEY || "",
  },

  // Lifecycle hooks
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    runtime.logger?.info(
      `R2R RAG plugin initialized with AI-powered response generation - R2RUrl: ${config.r2rUrl || "http://localhost:7272"}, HasApiKey: ${!!(config.r2rApiKey || process.env.R2R_API_KEY)}`,
    );
  },
};

export default r2rRAGPlugin;
