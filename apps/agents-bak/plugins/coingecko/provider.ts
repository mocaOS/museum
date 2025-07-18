import { IAgentRuntime, Memory, Provider } from "@ai16z/eliza";

export const coingeckoProvider: Provider = {
  get: async (_runtime: IAgentRuntime, _message: Memory) => {
    // fetch data from "https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?contract_addresses=0xcE899f26928a2B21c6a2Fddd393EF37c61dbA918&vs_currencies=usd"
    const response = await fetch("https://api.coingecko.com/api/v3/simple/token_price/polygon-pos?contract_addresses=0xcE899f26928a2B21c6a2Fddd393EF37c61dbA918&vs_currencies=usd");

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    const price = data["0xce899f26928a2b21c6a2fddd393ef37c61dba918"].usd;

    return `The current price of $MOCA is $${price.toFixed(2)}`;
  },
};
