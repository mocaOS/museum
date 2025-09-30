import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * Dynamically loads all character files from the characters directory
 */
async function loadCharactersFromDirectory(): Promise<Character[]> {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const charactersDir = join(__dirname, "characters");
  const characters: Character[] = [];

  try {
    const files = readdirSync(charactersDir);

    for (const file of files) {
      if (file.endsWith(".ts") && file.startsWith("decc0_")) {
        try {
          const characterModule = await import(`./characters/${file}`);
          if (characterModule.character) {
            characters.push(characterModule.character);
            logger.info(`✅ Loaded character from: ${file}`);
          } else {
            logger.warn(`⚠️  No character export found in: ${file}`);
          }
        } catch (error) {
          logger.error(`❌ Failed to load character from ${file}:`, error);
        }
      }
    }
  } catch (error) {
    logger.warn("⚠️  Could not read characters directory:", error);
  }

  return characters;
}

/**
 * Creates a project agent for a given character
 */
function createProjectAgent(character: Character): ProjectAgent {
  return {
    character,
    init: async (_runtime: IAgentRuntime) => {
      logger.info("Initializing character");
      logger.info("Name: ", character.name);
      logger.warn("OPENAI_API_KEY: ", process.env.OPENAI_API_KEY);
    },
    plugins: [ starterPlugin, coingeckoPlugin, r2rRAGPlugin ],
  };
}

// Load all characters dynamically
const decc0Characters = await loadCharactersFromDirectory();

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
