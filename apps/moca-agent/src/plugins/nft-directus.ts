import {
  Action,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  Service,
  State,
} from "@elizaos/core";
import type { Directus } from "@local/types";

interface NFTSearchOptions {
  artist?: string;
  name?: string;
  collection?: string;
  limit?: number;
  offset?: number;
}

interface NFTCountOptions {
  artist?: string;
  collection?: string;
  groupBy?: "artist" | "collection";
}

/**
 * Service for interacting with Directus backend to fetch NFT information
 */
export class DirectusNFTService extends Service {
  static serviceType = "directus-nft-service";
  capabilityDescription = "Provides NFT information from Directus backend";

  private baseUrl: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    // Default to localhost, can be overridden by environment variables
    this.baseUrl = process.env.DIRECTUS_URL || "http://localhost:8055";
  }

  static async start(runtime: IAgentRuntime): Promise<DirectusNFTService> {
    const service = new DirectusNFTService(runtime);
    return service;
  }

  async stop(): Promise<void> {
    // No resources to cleanup for this service
  }

  /**
   * Test connection to Directus
   */
  async testConnection(): Promise<boolean> {
    try {
      console.log("Testing Directus connection to:", this.baseUrl);
      const response = await fetch(`${this.baseUrl}/server/ping`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
      console.log("Ping response status:", response.status);
      return response.ok;
    } catch (error) {
      console.log("Connection test failed:", error);
      return false;
    }
  }

  /**
   * Search for NFTs based on various criteria
   */
  async searchNFTs(options: NFTSearchOptions): Promise<Directus.Nfts[]> {
    try {
      const searchParams = new URLSearchParams();

      // Build filter query using Directus nested parameter format
      let filterIndex = 0;

      if (options.artist) {
        searchParams.append(
          `filter[_and][${filterIndex}][artist_name][_contains]`,
          options.artist,
        );
        filterIndex++;
      }

      if (options.name) {
        searchParams.append(
          `filter[_and][${filterIndex}][name][_contains]`,
          options.name,
        );
        filterIndex++;
      }

      if (options.collection) {
        // Use _or for collection search (collection field OR collection_type.name)
        searchParams.append(
          `filter[_and][${filterIndex}][_or][0][collection][_contains]`,
          options.collection,
        );
        searchParams.append(
          `filter[_and][${filterIndex}][_or][1][collection_type][name][_contains]`,
          options.collection,
        );
        filterIndex++;
      }

      // Add limit and offset
      if (options.limit) {
        searchParams.append("limit", options.limit.toString());
      } else {
        searchParams.append("limit", "10"); // Default limit
      }

      if (options.offset) {
        searchParams.append("offset", options.offset.toString());
      }

      // Include related data - collection_type is the relationship to Collections
      searchParams.append(
        "fields",
        "*,collection_type.name,collection_type.title,collection_type.description,contract.address,contract.name",
      );

      const url = `${this.baseUrl}/items/nfts?${searchParams.toString()}`;
      console.log("🔍 NFT Search URL:", url);
      console.log("📋 Search Options:", options);

      this.runtime?.logger?.debug(
        `Fetching NFTs from Directus - URL: ${url}, Options: ${JSON.stringify(options)}`,
      );

      console.log("Making API request to:", url);
      // Add timeout and better error handling
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
          },
        });
        clearTimeout(timeout);

        console.log("Response status:", response.status);
        console.log(
          "Response headers:",
          Object.fromEntries(response.headers.entries()),
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.log("Error response body:", errorText);
          this.runtime?.logger?.error(
            `Directus API error details - Status: ${response.status}, StatusText: ${response.statusText}, URL: ${url}, ErrorBody: ${errorText}`,
          );
          throw new Error(
            `Directus API error: ${response.status} ${response.statusText}`,
          );
        }

        const data = (await response.json()) as { data: Directus.Nfts[] };
        console.log("API response data:", JSON.stringify(data, null, 2));
        return data.data || [];
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          console.log("Request timed out");
          throw new Error("Request to Directus API timed out");
        }
        throw fetchError;
      }
    } catch (error) {
      console.log("Detailed error:", error);
      console.log("Error type:", typeof error);
      console.log(
        "Error message:",
        error instanceof Error ? error.message : String(error),
      );
      console.log(
        "Error stack:",
        error instanceof Error ? error.stack : "No stack trace",
      );

      this.runtime?.logger?.error(
        `Error fetching NFTs from Directus - Options: ${JSON.stringify(options)}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      throw error;
    }
  }

  /**
   * Get NFT by ID
   */
  async getNFTById(id: number): Promise<Directus.Nfts | null> {
    try {
      const url = `${this.baseUrl}/items/nfts/${id}?fields=*,collection_type.name,collection_type.title,collection_type.description,contract.address,contract.name`;

      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(
          `Directus API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as { data: Directus.Nfts };
      return data.data;
    } catch (error) {
      this.runtime?.logger?.error(
        `Error fetching NFT by ID from Directus - ID: ${id}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get all collections
   */
  async getCollections(): Promise<Directus.Collections[]> {
    try {
      const url = `${this.baseUrl}/items/collections?fields=*&limit=100`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(
          `Directus API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as { data: Directus.Collections[] };
      return data.data || [];
    } catch (error) {
      this.runtime?.logger?.error(
        `Error fetching collections from Directus - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Count NFTs based on various criteria
   */
  async countNFTs(
    options: NFTCountOptions,
  ): Promise<{
    count: number;
    breakdown?: Array<{ key: string; count: number }>;
  }> {
    try {
      if (options.groupBy) {
        // Get grouped counts
        return await this.getGroupedNFTCount(options.groupBy, options);
      } else {
        // Get simple count with filters
        return await this.getSimpleNFTCount(options);
      }
    } catch (error) {
      this.runtime?.logger?.error(
        `Error counting NFTs from Directus - Options: ${JSON.stringify(options)}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Get simple count of NFTs with filters
   */
  private async getSimpleNFTCount(
    options: NFTCountOptions,
  ): Promise<{ count: number }> {
    const searchParams = new URLSearchParams();
    let filterIndex = 0;

    if (options.artist) {
      searchParams.append(
        `filter[_and][${filterIndex}][artist_name][_contains]`,
        options.artist,
      );
      filterIndex++;
    }

    if (options.collection) {
      searchParams.append(
        `filter[_and][${filterIndex}][_or][0][collection][_contains]`,
        options.collection,
      );
      searchParams.append(
        `filter[_and][${filterIndex}][_or][1][collection_type][name][_contains]`,
        options.collection,
      );
      filterIndex++;
    }

    // Use aggregate to get count
    searchParams.append("aggregate[count]", "*");

    const url = `${this.baseUrl}/items/nfts?${searchParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Directus API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { data: Array<{ count: number }> };
    return { count: data.data?.[0]?.count || 0 };
  }

  /**
   * Get grouped counts of NFTs
   */
  private async getGroupedNFTCount(
    groupBy: "artist" | "collection",
    options: NFTCountOptions,
  ): Promise<{
    count: number;
    breakdown: Array<{ key: string; count: number }>;
  }> {
    const searchParams = new URLSearchParams();
    let filterIndex = 0;

    // Apply filters
    if (options.artist && groupBy !== "artist") {
      searchParams.append(
        `filter[_and][${filterIndex}][artist_name][_contains]`,
        options.artist,
      );
      filterIndex++;
    }

    if (options.collection && groupBy !== "collection") {
      searchParams.append(
        `filter[_and][${filterIndex}][_or][0][collection][_contains]`,
        options.collection,
      );
      searchParams.append(
        `filter[_and][${filterIndex}][_or][1][collection_type][name][_contains]`,
        options.collection,
      );
      filterIndex++;
    }

    // Group by the specified field
    const groupField = groupBy === "artist" ? "artist_name" : "collection";
    searchParams.append("aggregate[count]", "*");
    searchParams.append("groupBy", groupField);

    const url = `${this.baseUrl}/items/nfts?${searchParams.toString()}`;

    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Directus API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ [key: string]: string | number; count: number }>;
    };

    const breakdown = (data.data || []).map(item => ({
      key: String(item[groupField] || "Unknown"),
      count: item.count || 0,
    }));

    const totalCount = breakdown.reduce((sum, item) => sum + item.count, 0);

    return { count: totalCount, breakdown };
  }

  /**
   * Format NFT data for display
   */
  formatNFTForDisplay(nft: Directus.Nfts): string {
    const parts: string[] = [];

    if (nft.name) {
      parts.push(`**${nft.name}**`);
    }

    if (nft.artist_name) {
      parts.push(`Artist: ${nft.artist_name}`);
    }

    // Check both collection (string field) and collection_type (relationship)
    if (nft.collection && typeof nft.collection === "string") {
      parts.push(`Collection: ${nft.collection}`);
    } else if (
      nft.collection_type
      && typeof nft.collection_type === "object"
      && "name" in nft.collection_type
    ) {
      const collection = nft.collection_type as Directus.Collections;
      if (collection.name) {
        parts.push(`Collection: ${collection.name}`);
      }
    }

    if (
      nft.contract
      && typeof nft.contract === "object"
      && "address" in nft.contract
    ) {
      const contract = nft.contract as Directus.Contracts;
      if (contract.address) {
        parts.push(`Contract: ${contract.address}`);
      }
    }

    if (nft.identifier) {
      parts.push(`Token ID: ${nft.identifier}`);
    }

    return parts.join("\n");
  }
}

/**
 * Action to search for NFTs
 */
export const searchNFTsAction: Action = {
  name: "SEARCH_NFTS",
  description: "Search for NFTs by artist name, NFT name, or collection",
  similes: [
    "find nft",
    "search nft",
    "look for nft",
    "find artwork",
    "search artwork",
    "show me nft",
    "get nft",
    "nft by artist",
    "nft in collection",
    "get me some info about nfts",
    "show me nfts from collection",
    "info about nfts from genesis collection",
    "nfts from genesis collection",
  ],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";

    // Look for NFT-related keywords
    const nftKeywords = [ "nft", "nfts", "artwork", "art", "token", "piece" ];
    const actionKeywords = [
      "find",
      "search",
      "show",
      "get",
      "look for",
      "display",
      "info",
      "information",
    ];

    const hasNFTKeyword = nftKeywords.some(keyword => text.includes(keyword));
    const hasActionKeyword = actionKeywords.some(keyword =>
      text.includes(keyword),
    );

    // Also check for artist/collection specific queries
    const hasArtistQuery = text.includes("artist") || text.includes("by ");
    const hasCollectionQuery
      = text.includes("collection") || text.includes("from ");

    // Debug logging to understand validation
    const validationResult
      = hasNFTKeyword
      && (hasActionKeyword || hasArtistQuery || hasCollectionQuery);
    runtime.logger?.debug(
      `NFT Action Validation - Text: "${text}", HasNFTKeyword: ${hasNFTKeyword}, HasActionKeyword: ${hasActionKeyword}, HasArtistQuery: ${hasArtistQuery}, HasCollectionQuery: ${hasCollectionQuery}, Result: ${validationResult}`,
    );

    return (
      hasNFTKeyword
      && (hasActionKeyword || hasArtistQuery || hasCollectionQuery)
    );
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: any,
  ) => {
    try {
      const nftService = runtime.getService(
        "directus-nft-service",
      ) as DirectusNFTService;

      if (!nftService) {
        const serviceErrorText
          = "NFT service is not available. Please check the configuration.";

        // Use callback to send service error to user
        if (callback) {
          await callback({
            text: serviceErrorText,
            action: "SEARCH_NFTS_ERROR",
          });
        }

        return {
          text: serviceErrorText,
          action: "SEARCH_NFTS_ERROR",
          success: false,
        };
      }

      const text = message.content.text?.toLowerCase() || "";
      const originalText = message.content.text || "";

      // Extract search parameters from the message
      const searchOptions: NFTSearchOptions = {};

      // Look for artist name
      const artistMatch = text.match(/(?:artist|by)\s+([^,\n]+)/i);
      if (artistMatch) {
        searchOptions.artist = artistMatch[1]
          .trim()
          .replace(/^["']|["']$/g, ""); // Remove surrounding quotes
      }

      // Look for collection name with more flexible patterns
      const collectionMatch
        = text.match(/(?:collection|from)\s+([^,\n.!?]+)/i)
        || text.match(/(?:in|of)\s+(.+?)\s+collection/i)
        || text.match(/(.+?)\s+collection/i);
      if (collectionMatch) {
        searchOptions.collection = collectionMatch[1]
          .trim()
          .replace(/^["']|["']$/g, ""); // Remove surrounding quotes
      }

      // Debug logging
      runtime.logger?.debug(
        `NFT Search Parameters - OriginalText: "${originalText}", SearchOptions: ${JSON.stringify(searchOptions)}, ArtistMatch: ${artistMatch?.[1] || "none"}, CollectionMatch: ${collectionMatch?.[1] || "none"}`,
      );

      // Look for NFT name
      const nameMatch = text.match(
        /(?:nft|artwork|art|piece|token)(?:\s+(?:named|called))?\s+([^,\n]+)/i,
      );
      if (nameMatch && !artistMatch && !collectionMatch) {
        searchOptions.name = nameMatch[1].trim().replace(/^["']|["']$/g, ""); // Remove surrounding quotes
      }

      // If no specific search criteria found, extract any quoted strings or capitalized words
      if (
        !searchOptions.artist
        && !searchOptions.collection
        && !searchOptions.name
      ) {
        const quotedMatch = text.match(/"([^"]+)"/);
        if (quotedMatch) {
          searchOptions.name = quotedMatch[1];
        } else {
          // Look for capitalized words that might be names
          const words = (message.content.text || "").split(" ");
          const capitalizedWords = words.filter(
            word =>
              word.length > 2
              && word[0] === word[0].toUpperCase()
              && word.slice(1) === word.slice(1).toLowerCase(),
          );
          if (capitalizedWords.length > 0) {
            searchOptions.name = capitalizedWords.join(" ");
          }
        }
      }

      // Test connection first
      console.log("Testing Directus connection before search...");
      const connectionOk = await nftService.testConnection();
      if (!connectionOk) {
        const connectionErrorText
          = "Unable to connect to the NFT database. Please check if the Directus service is running.";

        // Use callback to send connection error to user
        if (callback) {
          await callback({
            text: connectionErrorText,
            action: "SEARCH_NFTS_CONNECTION_ERROR",
          });
        }

        return {
          text: connectionErrorText,
          action: "SEARCH_NFTS_CONNECTION_ERROR",
          success: false,
        };
      }
      console.log("Connection test passed, proceeding with search...");

      const nfts = await nftService.searchNFTs(searchOptions);

      if (nfts.length === 0) {
        const searchTerms = [
          searchOptions.artist && `artist "${searchOptions.artist}"`,
          searchOptions.collection
            && `collection "${searchOptions.collection}"`,
          searchOptions.name && `name "${searchOptions.name}"`,
        ]
          .filter(Boolean)
          .join(", ");

        const noResultsText = `I couldn't find any NFTs matching your search${searchTerms ? ` for ${searchTerms}` : ""}. Try a different search term or check the spelling.`;

        // Use callback to send response to user
        if (callback) {
          await callback({
            text: noResultsText,
            action: "SEARCH_NFTS_NO_RESULTS",
          });
        }

        return {
          text: noResultsText,
          action: "SEARCH_NFTS_NO_RESULTS",
          success: true,
        };
      }

      console.log(`Found ${nfts.length} NFTs`);

      // Format results
      const formattedNFTs = nfts
        .slice(0, 5)
        .map(
          (nft, index) =>
            `${index + 1}. ${nftService.formatNFTForDisplay(nft)}`,
        )
        .join("\n\n");

      const resultText
        = nfts.length === 1
          ? `I found 1 NFT:\n\n${formattedNFTs}`
          : `I found ${nfts.length} NFTs${nfts.length > 5 ? " (showing first 5)" : ""}:\n\n${formattedNFTs}`;

      // Use callback to send response to user
      if (callback) {
        await callback({
          text: resultText,
          action: "SEARCH_NFTS_SUCCESS",
        });
      }

      return {
        text: resultText,
        action: "SEARCH_NFTS_SUCCESS",
        success: true,
        data: { nfts: nfts.slice(0, 5), total: nfts.length },
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in searchNFTsAction - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorText
        = "I encountered an error while searching for NFTs. Please try again later.";

      // Use callback to send error response to user
      if (callback) {
        await callback({
          text: errorText,
          action: "SEARCH_NFTS_ERROR",
        });
      }

      return {
        text: errorText,
        action: "SEARCH_NFTS_ERROR",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "Find NFTs by artist Pak" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found 3 NFTs by artist Pak:\n\n1. **The Pixel**\nArtist: Pak\nCollection: Digital Artifacts\nContract: 0x123...\nToken ID: 1",
          action: "SEARCH_NFTS_SUCCESS",
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: { text: "Show me NFTs from Genesis Collection" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found 5 NFTs from Genesis Collection:\n\n1. **First Light**\nArtist: Creator1\nCollection: Genesis Collection\nContract: 0x456...\nToken ID: 1",
          action: "SEARCH_NFTS_SUCCESS",
        },
      },
    ],
  ],
};

/**
 * Action to count NFTs
 */
export const countNFTsAction: Action = {
  name: "COUNT_NFTS",
  description:
    "Count NFTs by collection, artist, or get total counts with optional breakdowns",
  similes: [
    "count nft",
    "count nfts",
    "how many nft",
    "how many nfts",
    "number of nft",
    "number of nfts",
    "total nft",
    "total nfts",
    "nft count",
    "nfts count",
    "count artwork",
    "count artworks",
    "how many artwork",
    "how many artworks",
    "count by artist",
    "count by collection",
    "nfts by artist count",
    "nfts in collection count",
    "breakdown of nfts",
    "nft statistics",
    "nft stats",
    "show me nft counts",
    "get nft counts",
  ],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    const text = message.content.text?.toLowerCase() || "";

    // Look for count-related keywords
    const countKeywords = [
      "count",
      "how many",
      "number of",
      "total",
      "statistics",
      "stats",
      "breakdown",
    ];
    const nftKeywords = [
      "nft",
      "nfts",
      "artwork",
      "artworks",
      "art",
      "token",
      "tokens",
      "piece",
      "pieces",
    ];

    const hasCountKeyword = countKeywords.some(keyword =>
      text.includes(keyword),
    );
    const hasNFTKeyword = nftKeywords.some(keyword => text.includes(keyword));

    // Also check for specific phrases
    const hasCountPhrase
      = text.includes("how many")
      || text.includes("count of")
      || text.includes("number of");

    // Debug logging
    const validationResult = (hasCountKeyword || hasCountPhrase) && hasNFTKeyword;
    runtime.logger?.debug(
      `Count NFT Action Validation - Text: "${text}", HasCountKeyword: ${hasCountKeyword}, HasNFTKeyword: ${hasNFTKeyword}, HasCountPhrase: ${hasCountPhrase}, Result: ${validationResult}`,
    );

    return (hasCountKeyword || hasCountPhrase) && hasNFTKeyword;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: any,
    callback?: any,
  ) => {
    try {
      const nftService = runtime.getService(
        "directus-nft-service",
      ) as DirectusNFTService;

      if (!nftService) {
        const serviceErrorText
          = "NFT service is not available. Please check the configuration.";

        if (callback) {
          await callback({
            text: serviceErrorText,
            action: "COUNT_NFTS_ERROR",
          });
        }

        return {
          text: serviceErrorText,
          action: "COUNT_NFTS_ERROR",
          success: false,
        };
      }

      const text = message.content.text?.toLowerCase() || "";

      // Extract count parameters from the message
      const countOptions: NFTCountOptions = {};

      // Check for groupBy request
      if (
        text.includes("by artist")
        || text.includes("per artist")
        || text.includes("each artist")
      ) {
        countOptions.groupBy = "artist";
      } else if (
        text.includes("by collection")
        || text.includes("per collection")
        || text.includes("each collection")
      ) {
        countOptions.groupBy = "collection";
      }

      // Look for specific artist
      const artistMatch = text.match(/(?:artist|by)\s+([^,\n]+)/i);
      if (artistMatch && !countOptions.groupBy) {
        countOptions.artist = artistMatch[1].trim().replace(/^["']|["']$/g, "");
      }

      // Look for specific collection
      const collectionMatch
        = text.match(/(?:collection|from|in)\s+([^,\n.!?]+)/i)
        || text.match(/(.+?)\s+collection/i);
      if (collectionMatch && !countOptions.groupBy) {
        countOptions.collection = collectionMatch[1]
          .trim()
          .replace(/^["']|["']$/g, "");
      }

      // Test connection first
      const connectionOk = await nftService.testConnection();
      if (!connectionOk) {
        const connectionErrorText
          = "Unable to connect to the NFT database. Please check if the Directus service is running.";

        if (callback) {
          await callback({
            text: connectionErrorText,
            action: "COUNT_NFTS_CONNECTION_ERROR",
          });
        }

        return {
          text: connectionErrorText,
          action: "COUNT_NFTS_CONNECTION_ERROR",
          success: false,
        };
      }

      const result = await nftService.countNFTs(countOptions);

      let resultText: string;

      if (result.breakdown && result.breakdown.length > 0) {
        // Format grouped results
        const groupType
          = countOptions.groupBy === "artist" ? "artist" : "collection";
        const breakdown = result.breakdown
          .sort((a, b) => b.count - a.count) // Sort by count descending
          .slice(0, 10) // Show top 10
          .map(
            (item, index) =>
              `${index + 1}. ${item.key}: ${item.count} NFT${item.count !== 1 ? "s" : ""}`,
          )
          .join("\n");

        resultText = `I found a total of ${result.count} NFT${result.count !== 1 ? "s" : ""} grouped by ${groupType}:\n\n${breakdown}`;

        if (result.breakdown.length > 10) {
          resultText += `\n\n... and ${result.breakdown.length - 10} more ${groupType}${result.breakdown.length - 10 !== 1 ? "s" : ""}`;
        }
      } else {
        // Format simple count result
        const filters: string[] = [];
        if (countOptions.artist) {
          filters.push(`artist "${countOptions.artist}"`);
        }
        if (countOptions.collection) {
          filters.push(`collection "${countOptions.collection}"`);
        }

        const filterText
          = filters.length > 0 ? ` for ${filters.join(" and ")}` : "";
        resultText = `I found ${result.count} NFT${result.count !== 1 ? "s" : ""}${filterText}.`;
      }

      if (callback) {
        await callback({
          text: resultText,
          action: "COUNT_NFTS_SUCCESS",
        });
      }

      return {
        text: resultText,
        action: "COUNT_NFTS_SUCCESS",
        success: true,
        data: result,
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in countNFTsAction - Error: ${error instanceof Error ? error.message : String(error)}`,
      );

      const errorText
        = "I encountered an error while counting NFTs. Please try again later.";

      if (callback) {
        await callback({
          text: errorText,
          action: "COUNT_NFTS_ERROR",
        });
      }

      return {
        text: errorText,
        action: "COUNT_NFTS_ERROR",
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "How many NFTs are in the Genesis Collection?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found 25 NFTs for collection \"Genesis Collection\".",
          action: "COUNT_NFTS_SUCCESS",
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: { text: "Count NFTs by artist" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found a total of 150 NFTs grouped by artist:\n\n1. Pak: 45 NFTs\n2. Beeple: 32 NFTs\n3. CryptoPunk: 28 NFTs\n4. Artist4: 20 NFTs\n5. Artist5: 15 NFTs",
          action: "COUNT_NFTS_SUCCESS",
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: { text: "How many NFTs does Pak have?" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found 45 NFTs for artist \"Pak\".",
          action: "COUNT_NFTS_SUCCESS",
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: { text: "Show me NFT counts by collection" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "I found a total of 200 NFTs grouped by collection:\n\n1. Genesis Collection: 75 NFTs\n2. Digital Artifacts: 45 NFTs\n3. Modern Art: 30 NFTs\n4. Abstract Series: 25 NFTs\n5. Pixel Art: 15 NFTs",
          action: "COUNT_NFTS_SUCCESS",
        },
      },
    ],
  ],
};

/**
 * Provider that supplies NFT context information
 */
export const nftContextProvider: Provider = {
  name: "NFT_CONTEXT_PROVIDER",
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    try {
      const nftService = runtime.getService(
        "directus-nft-service",
      ) as DirectusNFTService;

      if (!nftService) {
        return {
          text: "",
          data: {},
        };
      }

      // Get recent collections to provide context
      const collections = await nftService.getCollections();

      const contextInfo = [
        "Available NFT Collections:",
        ...collections
          .slice(0, 5)
          .map(col => `- ${col.name}${col.title ? ` (${col.title})` : ""}`),
        "",
        "You can search for NFTs by:",
        "- Artist name (e.g., \"Find NFTs by Pak\")",
        "- NFT name (e.g., \"Show me The Pixel\")",
        "- Collection (e.g., \"NFTs from Genesis Collection\")",
        "",
        "You can count NFTs by:",
        "- Total count (e.g., \"How many NFTs are there?\")",
        "- By artist (e.g., \"Count NFTs by artist\" or \"How many NFTs does Pak have?\")",
        "- By collection (e.g., \"Count NFTs by collection\" or \"How many NFTs in Genesis Collection?\")",
        "- Get breakdowns (e.g., \"Show NFT statistics by artist\")",
      ];

      return {
        text: contextInfo.join("\n"),
        data: { collections: collections.slice(0, 5) },
      };
    } catch (error) {
      runtime.logger?.error(
        `Error in nftContextProvider - Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        text: "NFT information is temporarily unavailable.",
        data: {},
      };
    }
  },
};

/**
 * Main plugin definition
 */
export const nftDirectusPlugin: Plugin = {
  name: "nft-directus",
  description: "Fetches NFT information from Directus backend",

  // Register service
  services: [ DirectusNFTService ],

  // Register actions
  actions: [ searchNFTsAction, countNFTsAction ],

  // Register providers
  providers: [ nftContextProvider ],

  // Configuration
  config: {
    directusUrl: process.env.DIRECTUS_URL || "http://localhost:8055",
  },

  // Lifecycle hooks
  async init(config: Record<string, string>, runtime: IAgentRuntime) {
    runtime.logger?.info(
      `NFT Directus plugin initialized - DirectusUrl: ${config.directusUrl || "http://localhost:8055"}`,
    );
  },
};

export default nftDirectusPlugin;
