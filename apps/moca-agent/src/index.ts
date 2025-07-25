import { type IAgentRuntime, type Project, type ProjectAgent, logger } from "@elizaos/core";
import { character } from "./character.ts";
import starterPlugin from "./plugin.ts";
import coingeckoPlugin from "./plugins/coingecko.ts";

function initCharacter({ runtime }: { runtime: IAgentRuntime }) {
  logger.info("Initializing character");
  logger.info("Name: ", character.name);
  logger.warn("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY);
}

export const projectAgent: ProjectAgent = {
  character,
  init: async (runtime: IAgentRuntime) => await initCharacter({ runtime }),
  plugins: [starterPlugin, coingeckoPlugin], // <-- Import custom plugins here
};
const project: Project = {
  agents: [ projectAgent ],
};

// Export test suites for the test runner
export { testSuites } from "./__tests__/e2e";
export { character } from "./character.ts";

export default project;
