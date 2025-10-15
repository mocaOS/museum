import {
  type Character,
  type IAgentRuntime,
  type Project,
  type ProjectAgent,
  logger,
} from "@elizaos/core";

import starterPlugin from "./plugin.ts";
import coingeckoPlugin from "./plugins/coingecko.ts";
import r2rRAGPlugin from "./plugins/r2r-rag.ts";

// Import all DeCC0 characters statically
import { character as decc0_1001 } from "./characters/decc0_1001.ts";

/**
 * Array of all DeCC0 characters
 */
const decc0Characters: Character[] = [
  decc0_1001,
];

/**
 * Creates a project agent for a given character
 */
function createProjectAgent(character: Character): ProjectAgent {
  return {
    character,
    init: async (_runtime: IAgentRuntime) => {
      logger.info("Initializing character");
      logger.info("Name: ", character.name);
    },
    plugins: [ starterPlugin, coingeckoPlugin, r2rRAGPlugin ],
  };
}

// Create project with all agents
const project: Project = {
  agents: [
    // Include the main MOCA Curator agent
    // createProjectAgent(mocaCuratorCharacter),
    // Include all DeCC0 character agents
    ...decc0Characters.map(createProjectAgent),
  ],
};

logger.info(
  `🎭 Total agents loaded: ${project.agents.length} (1 MOCA Curator + ${decc0Characters.length} DeCC0)`,
);

// Export test suites for the test runner
export { testSuites } from "./__tests__/e2e";
export { character } from "./character.ts";

export default project;
