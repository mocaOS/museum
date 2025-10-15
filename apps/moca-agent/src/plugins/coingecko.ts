import type {
  IAgentRuntime,
  Memory,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { Plugin, logger } from "@elizaos/core";
import { z } from "zod";
import Coingecko from "@coingecko/coingecko-typescript";

/**
 * Define the configuration schema for the CoinGecko plugin
 */
const configSchema = z.object({
  COINGECKO_API_KEY: z
    .string()
    .min(1, "CoinGecko API key is required")
    .optional()
    .transform((val) => {
      if (!val) {
        console.warn(
          "Warning: CoinGecko API key is not provided, using free tier",
        );
      }
      return val;
    }),
});

/**
 * Type alias for CoinGecko market data response item
 */
type CoinGeckoPrice =
  Coingecko.Coins.Markets.MarketGetResponse.MarketGetResponseItem;

/**
 * CoinGecko API service using the official TypeScript client
 */
class CoinGeckoService {
  private client: any;
  private useFreeApi: boolean;

  private apiKey?: string;
  private triedDemo = false;
  private triedPro = false;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
    this.useFreeApi = !apiKey;

    if (apiKey) {
      // Start with Demo API (most common)
      this.initializeDemoClient();
    } else {
      this.client = null;
    }
  }

  private initializeDemoClient() {
    if (!this.apiKey || this.triedDemo) return;

    try {
      this.client = new Coingecko({
        demoAPIKey: this.apiKey,
        environment: "demo",
      });
      this.triedDemo = true;
      logger.info("Initialized CoinGecko with Demo API");
    } catch (error) {
      logger.warn("Demo API client initialization failed:", error);
      this.initializeProClient();
    }
  }

  private initializeProClient() {
    if (!this.apiKey || this.triedPro) return;

    try {
      this.client = new Coingecko({
        proAPIKey: this.apiKey,
        environment: "pro",
      });
      this.triedPro = true;
      logger.info("Initialized CoinGecko with Pro API");
    } catch (error) {
      logger.warn("Pro API client initialization failed:", error);
      this.client = null;
    }
  }

  /**
   * Fetch token price data from CoinGecko
   */
  async fetchTokenPrice(tokenId: string): Promise<CoinGeckoPrice | null> {
    try {
      // Try official client first
      if (this.client) {
        try {
          const response = await this.client.coins.markets.get({
            vs_currency: "usd",
            ids: tokenId,
            order: "market_cap_desc",
            per_page: 1,
            page: 1,
            sparkline: false,
            price_change_percentage: "24h",
          });

          if (response && response.length > 0) {
            return response[0];
          }
        } catch (clientError: any) {
          // Check if it's an API key type mismatch error
          const errorMessage = clientError?.message || "";
          if (
            errorMessage.includes("Demo API key")
            && errorMessage.includes("pro-api.coingecko.com")
          ) {
            logger.info(
              "Detected Demo API key being used with Pro endpoint, switching to Demo API",
            );
            this.initializeDemoClient();

            // Try again with Demo API
            if (this.client) {
              try {
                const response = await this.client.coins.markets.get({
                  vs_currency: "usd",
                  ids: tokenId,
                  order: "market_cap_desc",
                  per_page: 1,
                  page: 1,
                  sparkline: false,
                  price_change_percentage: "24h",
                });

                if (response && response.length > 0) {
                  return response[0];
                }
              } catch (retryError) {
                logger.warn("Demo API retry failed:", retryError);
              }
            }
          } else if (
            errorMessage.includes("Pro API key")
            || (!this.triedPro && this.triedDemo)
          ) {
            logger.info("Trying Pro API as fallback");
            this.initializeProClient();

            // Try again with Pro API
            if (this.client) {
              try {
                const response = await this.client.coins.markets.get({
                  vs_currency: "usd",
                  ids: tokenId,
                  order: "market_cap_desc",
                  per_page: 1,
                  page: 1,
                  sparkline: false,
                  price_change_percentage: "24h",
                });

                if (response && response.length > 0) {
                  return response[0];
                }
              } catch (retryError) {
                logger.warn("Pro API retry failed:", retryError);
              }
            }
          }

          logger.warn(
            "Official client failed, falling back to manual API:",
            clientError,
          );
        }
      }

      // Fallback to manual API call
      return await this.fetchTokenPriceManual(tokenId);
    } catch (error) {
      logger.error(`Error fetching price for ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Manual API implementation as fallback (only use free API for fallback)
   */
  private async fetchTokenPriceManual(
    tokenId: string,
  ): Promise<CoinGeckoPrice | null> {
    try {
      // Always use free API for manual fallback to avoid authentication issues
      const baseUrl = "https://api.coingecko.com/api/v3";

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      const url = `${baseUrl}/coins/markets?vs_currency=usd&ids=${tokenId}&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`;

      logger.info(
        `Fetching price for ${tokenId} from CoinGecko free API (manual fallback)`,
      );

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `CoinGecko API error: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as CoinGeckoPrice[];

      if (data.length === 0) {
        logger.warn(`No price data found for token: ${tokenId}`);
        return null;
      }

      return data[0];
    } catch (error) {
      logger.error(`Manual API call failed for ${tokenId}:`, error);
      return null;
    }
  }

  /**
   * Search for a token by symbol or name
   */
  async searchToken(query: string): Promise<any> {
    try {
      // Try official client first
      if (this.client) {
        try {
          return await this.client.search.get({ query });
        } catch (clientError: any) {
          // Check if it's an API key type mismatch error
          const errorMessage = clientError?.message || "";
          if (
            errorMessage.includes("Demo API key")
            && errorMessage.includes("pro-api.coingecko.com")
          ) {
            logger.info(
              "Detected Demo API key being used with Pro endpoint, switching to Demo API",
            );
            this.initializeDemoClient();

            // Try again with Demo API
            if (this.client) {
              try {
                return await this.client.search.get({ query });
              } catch (retryError) {
                logger.warn("Demo API search retry failed:", retryError);
              }
            }
          } else if (
            errorMessage.includes("Pro API key")
            || (!this.triedPro && this.triedDemo)
          ) {
            logger.info("Trying Pro API for search as fallback");
            this.initializeProClient();

            // Try again with Pro API
            if (this.client) {
              try {
                return await this.client.search.get({ query });
              } catch (retryError) {
                logger.warn("Pro API search retry failed:", retryError);
              }
            }
          }

          logger.warn(
            "Official client search failed, falling back to manual API:",
            clientError,
          );
        }
      }

      // Fallback to manual API call (use free API)
      const baseUrl = "https://api.coingecko.com/api/v3";

      const headers: Record<string, string> = {
        Accept: "application/json",
      };

      const url = `${baseUrl}/search?query=${encodeURIComponent(query)}`;

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(
          `CoinGecko API error: ${response.status} ${response.statusText}`,
        );
      }

      return await response.json();
    } catch (error) {
      logger.error(`Error searching for token ${query}:`, error);
      return null;
    }
  }
}

/**
 * Provider that supplies current $MOCA token price data
 */
const mocaTokenPriceProvider: Provider = {
  name: "MOCA_TOKEN_PRICE",
  description:
    "Provides current $MOCA token price and market data from CoinGecko",
  dynamic: true, // Price data changes frequently
  position: 10, // Higher priority for financial data

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> => {
    try {
      const apiKey = runtime.getSetting("COINGECKO_API_KEY");
      const service = new CoinGeckoService(apiKey);

      // MOCA token ID on CoinGecko
      const mocaData = await service.fetchTokenPrice("museum-of-crypto-art");

      if (!mocaData) {
        logger.warn("Failed to fetch MOCA token price data");
        return {
          text: "MOCA token price data is currently unavailable.",
          values: {
            mocaPrice: null,
            priceAvailable: false,
            error: "PRICE_UNAVAILABLE",
          },
          data: {
            error: "PRICE_UNAVAILABLE",
            timestamp: Date.now(),
          },
        };
      }

      const currentPrice = mocaData.current_price ?? 0;
      const change24h = mocaData.price_change_percentage_24h ?? 0;
      const volume = mocaData.total_volume ?? 0;
      const marketCap = mocaData.market_cap ?? 0;
      const lastUpdated = mocaData.last_updated ?? new Date().toISOString();

      const changeEmoji = change24h > 0 ? "📈" : change24h < 0 ? "📉" : "➡️";
      const changeText
        = change24h > 0
          ? `+${change24h.toFixed(2)}%`
          : `${change24h.toFixed(2)}%`;

      const priceText = `🎨 $MOCA Token: $${currentPrice.toFixed(6)} USD ${changeEmoji} ${changeText} (24h)`;

      return {
        text: priceText,
        values: {
          mocaPrice: currentPrice,
          mocaChange24h: change24h,
          mocaVolume: volume,
          mocaMarketCap: marketCap,
          priceAvailable: true,
          changeEmoji,
          changeText,
          formattedPrice: `$${currentPrice.toFixed(6)}`,
          formattedVolume: `$${volume.toLocaleString()}`,
          formattedMarketCap: `$${marketCap.toLocaleString()}`,
          lastUpdated,
        },
        data: {
          fullPriceData: mocaData,
          providerName: "MOCA_TOKEN_PRICE",
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error("Error in MOCA price provider:", error);
      return {
        text: "MOCA token price data encountered an error.",
        values: {
          mocaPrice: null,
          priceAvailable: false,
          error: "FETCH_FAILED",
        },
        data: {
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * CoinGecko Plugin for elizaOS
 */
const coingeckoPlugin: Plugin = {
  name: "coingecko",
  description:
    "Provides cryptocurrency price data from CoinGecko API, specifically for $MOCA token",
  priority: 1000,
  config: {
    COINGECKO_API_KEY: process.env.COINGECKO_API_KEY,
  },

  async init(config: Record<string, string>) {
    logger.info("*** Initializing CoinGecko plugin ***");
    try {
      const validatedConfig = await configSchema.parseAsync(config);

      // Set all environment variables at once
      for (const [ key, value ] of Object.entries(validatedConfig)) {
        if (value) process.env[key] = value;
      }

      logger.info("CoinGecko plugin initialized successfully");
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new TypeError(
          `Invalid CoinGecko plugin configuration: ${error.errors.map(e => e.message).join(", ")}`,
        );
      }
      throw error;
    }
  },

  providers: [ mocaTokenPriceProvider ],
};

export default coingeckoPlugin;
