import { Action, Content, IAgentRuntime, Memory, State } from "@ai16z/eliza";
import { coingeckoProvider } from "./provider.ts";

export interface CoingeckoActionContent extends Content {
  text: string;
}

export const getWeatherAction: Action = {
  name: "GET_MOCA_PRICE",
  description: "Get the current price of $MOCA token from Coingecko",
  similes: [
    "TOKEN_PRICE",
    "TOKEN_INFO",
    "TOKEN_LOOKUP",
    "TOKEN_QUERY",
  ],
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "What's the current price of $MOCA?",
        } as CoingeckoActionContent,
      },
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "How much is $MOCA worth?",
        } as CoingeckoActionContent,
      },
      {
        user: "{{agentName}}",
        content: {
          text: "The current price of $MOCA is $0.123",
          action: "GET_MOCA_PRICE",
        },
      },
    ],
  ],

  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<boolean> => {
    try {
      const content = message.content as CoingeckoActionContent;
      return (
        typeof content.text === "string"
                && content.text.toLowerCase().includes("price")
      );
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
  ): Promise<string> => {
    try {
      return await coingeckoProvider.get(runtime, message, state);
    } catch (error) {
      return `Sorry, I couldn't retrieve the price of $MOCA: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  },
};
