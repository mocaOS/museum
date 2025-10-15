#!/usr/bin/env bun
/**
 * DeCC0 Character Generator
 *
 * This script generates ElizaOS character files for DeCC0 NFTs based on their codex data.
 *
 * Usage:
 *   bun run generate-characters.ts 0x1234567890abcdef1234567890abcdef12345678
 *
 * This will:
 * - Query Directus to find the user by wallet address
 * - Find the application associated with that user
 * - Extract token IDs from the application's decc0s field
 * - Fetch codex data from Directus API (/codex/:token_id endpoint)
 * - Generate character files in src/characters/decc0_TOKENID.ts for found token IDs
 * - Skip token IDs that don't have corresponding codex files (with warning)
 * - Delete any existing decc0_*.ts files that weren't successfully generated
 * - Update src/index.ts with the necessary imports and character array for found tokens only
 * - Exit with success if at least one character was successfully generated
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface MessageExample {
  content: {
    text: string;
  };
  name: string;
}

interface AgentProfile {
  adjectives?: string[];
  bio?: string[];
  knowledge?: string[];
  messageExamples?: Array<Array<MessageExample> | { messages: MessageExample[] }>;
  name?: string;
  plugins?: string[];
  postExamples?: string[];
  settings?: Record<string, unknown>;
  style?: {
    all?: string[];
    chat?: string[];
    post?: string[];
  };
  system?: string;
  target?: string;
  timestamp_created?: string;
  topics?: string[];
  username?: string;
  version?: string;
}

interface CodexData {
  agent_profiles?: Record<string, AgentProfile> & {
    latest?: string;
  };
  timestamp_created?: string;
  whatness?: string[];
  writing_comma?: string;
  writing_ellipses?: string;
  writing_exclamation?: string;
  writing_flavor?: string;
  writing_flavor_cultural?: string;
  writing_questions?: string;
  writing_quirks?: string;
  writing_quotation_marks?: string;
  writing_sentence_complexity?: string;
  writing_style?: string[];
  x?: number;
  name?: string[];
  description?: string;
  characterization?: string;
  biography?: string[];
  biography_addendum?: string;
  cultural_affiliation?: string;
  philosophical_affiliation?: string;
  gender?: string[];
  self_identity?: string;
  favorite_book?: string;
  favorite_cryptoartist?: string;
  favorite_role?: string;
  cryptoart_focus?: string;
  topics?: string[];
  mood?: string;
  thumbnail?: string;
}

// Parse command-line arguments for wallet address
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("❌ Error: No wallet address provided");
  console.log("Usage: bun run generate-characters.ts 0x1234567890abcdef1234567890abcdef12345678");
  process.exit(1);
}

const walletAddress = args[0].trim().toLowerCase();

if (!walletAddress) {
  console.error("❌ Error: Invalid wallet address");
  process.exit(1);
}

console.log(`🔍 Looking up application for wallet address: ${walletAddress}`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_BASE_URL = "https://api-staging.moca.qwellco.de";
const CHARACTERS_DIR = join(__dirname, "src", "characters");

// Get Directus configuration from environment
const DIRECTUS_URL = process.env.DIRECTUS_URL || API_BASE_URL;
const DIRECTUS_TOKEN = process.env.DIRECTUS_API_KEY;

if (!DIRECTUS_TOKEN) {
  console.error("❌ Error: DIRECTUS_ADMIN_TOKEN environment variable is required");
  process.exit(1);
}

// Function to query Directus for token IDs by wallet address
async function getTokenIdsByWalletAddress(walletAddress: string): Promise<number[]> {
  try {
    // First, find the user by ethereum_address
    const usersUrl = `${DIRECTUS_URL}/users?filter[ethereum_address][_eq]=${walletAddress}&fields=id`;
    const usersResponse = await fetch(usersUrl, {
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
    });

    if (!usersResponse.ok) {
      throw new Error(`Failed to fetch user: HTTP ${usersResponse.status}`);
    }

    const usersData = await usersResponse.json();
    const users = usersData?.data || [];

    if (users.length === 0) {
      throw new Error(`No user found with ethereum_address: ${walletAddress}`);
    }

    const userId = users[0].id;
    console.log(`✅ Found user ID: ${userId}`);

    // Then, find the application for this user
    const appsUrl = `${DIRECTUS_URL}/items/applications?filter[owner][_eq]=${userId}&fields=decc0s&limit=1`;
    const appsResponse = await fetch(appsUrl, {
      headers: {
        Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      },
    });

    if (!appsResponse.ok) {
      throw new Error(`Failed to fetch application: HTTP ${appsResponse.status}`);
    }

    const appsData = await appsResponse.json();
    const applications = appsData?.data || [];

    if (applications.length === 0) {
      throw new Error(`No application found for user ${userId}`);
    }

    const decc0s = applications[0].decc0s || "";
    console.log(`✅ Found application with decc0s: ${decc0s}`);

    // Parse token IDs from decc0s field
    const tokenIds: number[] = decc0s
      .split(",")
      .map((id: string) => id.trim())
      .filter((id: string) => id !== "")
      .map((id: string) => Number.parseInt(id, 10))
      .filter((id: number) => !Number.isNaN(id));

    if (tokenIds.length === 0) {
      throw new Error("No valid token IDs found in application decc0s field");
    }

    return tokenIds;
  } catch (error) {
    console.error("❌ Error fetching token IDs from Directus:", error);
    throw error;
  }
}

// Fetch token IDs from Directus
let tokenIds: number[];
try {
  tokenIds = await getTokenIdsByWalletAddress(walletAddress);
  console.log(`🎭 Generating characters for token IDs: ${tokenIds.join(", ")}`);
} catch (error) {
  process.exit(1);
}

// Ensure the characters directory exists
if (!existsSync(CHARACTERS_DIR)) {
  mkdirSync(CHARACTERS_DIR, { recursive: true });
  console.log(`📁 Created characters directory: ${CHARACTERS_DIR}`);
}

console.log(`🔗 Using API base URL: ${API_BASE_URL}`);

// Helper function to get the latest agent profile from codex data
function getLatestProfile(data: CodexData): AgentProfile | undefined {
  if (!data.agent_profiles?.latest) return undefined;

  const version = data.agent_profiles.latest;

  return data.agent_profiles[version];
}

// Function to generate a character name from codex data
function getCharacterName(data: CodexData, tokenId: number): string {
  const profile = getLatestProfile(data);

  // Try to get name from agent profile first
  if (profile?.name) {
    return profile.name;
  }

  // Try to get name from root level
  if (data.name && data.name.length > 0) {
    return data.name[0];
  }

  // Fallback to token ID
  return `DeCC0 #${tokenId}`;
}

// Function to generate character bio from codex data
function generateCharacterBio(data: CodexData): string[] {
  const profile = getLatestProfile(data);

  if (profile?.bio && profile.bio.length > 0) {
    return profile.bio;
  }

  // Fallback to default bio if no profile bio is available
  return [
    "A DeCC0 NFT character from the Museum of Crypto Art (M○C△).",
    "Part of a groundbreaking collection that embodies the principles of decentralized creativity.",
  ];
}

// Function to generate system prompt
function generateSystemPrompt(data: CodexData, tokenId: number): string {
  const profile = getLatestProfile(data);

  // Use system prompt from agent profile if available
  if (profile?.system) {
    return profile.system;
  }

  // Otherwise, generate a default system prompt
  const name = getCharacterName(data, tokenId);
  let prompt = `You are ${name}, a DeCC0 NFT character from the Museum of Crypto Art (M○C△).\n\n`;

  // Add bio if available
  if (profile?.bio && profile.bio.length > 0) {
    prompt += `${profile.bio.join("\n\n")}\n\n`;
  }

  // Add knowledge if available
  if (profile?.knowledge && profile.knowledge.length > 0) {
    prompt += "Key knowledge:\n";
    profile.knowledge.slice(0, 5).forEach((k) => {
      prompt += `- ${k}\n`;
    });
    prompt += "\n";
  }

  prompt += "As a DeCC0 character, you embody the principles of decentralized creativity and crypto art. ";
  prompt += "You are part of MOCA's collection and represent the intersection of art, technology, and blockchain culture.\n\n";
  prompt += "Behavioral principles:\n";
  prompt += "- Be expressive, creative, and authentic to your character\n";
  prompt += "- Share insights about crypto art and NFT culture\n";
  prompt += "- Engage with visitors about MOCA's mission and collection\n";
  prompt += "- Reflect on your artistic heritage and cultural background\n";

  return prompt;
}

// Function to generate topics
function generateTopics(data: CodexData): string[] {
  const profile = getLatestProfile(data);

  // Use topics from agent profile if available
  if (profile?.topics && profile.topics.length > 0) {
    return profile.topics;
  }

  // Use topics from root level if available
  if (data.topics && data.topics.length > 0) {
    return data.topics;
  }

  // Default topics
  return [
    "DeCC0 NFT collection",
    "Crypto art and NFT culture",
    "MOCA's mission and collection",
    "Blockchain technology and art",
  ];
}

// Helper function to escape strings for TypeScript output
function escapeForTypeScript(str: string): string {
  return str
    .replace(/\\/g, "\\\\") // Escape backslashes first
    .replace(/"/g, "\\\"") // Escape double quotes
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "\\r") // Escape carriage returns
    .replace(/\t/g, "\\t"); // Escape tabs
}

// Helper function to format string arrays with proper indentation and trailing commas
function formatStringArray(arr: string[], indent: number): string {
  if (arr.length === 0) return "[]";
  const indentStr = " ".repeat(indent);
  const items = arr.map(item => `${indentStr}"${escapeForTypeScript(item)}",`).join("\n");
  return `[\n${items}\n${" ".repeat(indent - 2)}]`;
}

// Helper function to format message examples with proper indentation and trailing commas
function formatMessageExamples(examples: Array<Array<MessageExample>>, indent: number): string {
  if (examples.length === 0) return "[]";
  const indentStr = " ".repeat(indent);
  const innerIndent = " ".repeat(indent + 2);
  const contentIndent = " ".repeat(indent + 4);

  const formatted = examples.map((conversation) => {
    const messages = conversation.map((msg) => {
      return `${innerIndent}{\n${contentIndent}content: {\n${contentIndent}  text: "${escapeForTypeScript(msg.content.text)}",\n${contentIndent}},\n${contentIndent}name: "${escapeForTypeScript(msg.name)}",\n${innerIndent}},`;
    }).join("\n");
    return `${indentStr}[\n${messages}\n${indentStr}],`;
  }).join("\n");

  return `[\n${formatted}\n${" ".repeat(indent - 2)}]`;
}

// Helper function to normalize message examples
function normalizeMessageExamples(examples: Array<Array<MessageExample> | { messages: MessageExample[] }>): Array<Array<MessageExample>> {
  return examples.map((example) => {
    if (Array.isArray(example)) {
      return example;
    }
    if ("messages" in example) {
      return example.messages;
    }
    return [];
  });
}

// Helper function to format avatar/thumbnail as data URI if needed
function formatAvatar(thumbnail?: string): string {
  if (!thumbnail) return "";

  // If it already starts with data:, http:, or https:, return as-is
  if (thumbnail.startsWith("data:") || thumbnail.startsWith("http:") || thumbnail.startsWith("https:")) {
    return thumbnail;
  }

  // If it looks like base64 image data, add the appropriate data URI prefix
  // JPEG images start with /9j/
  if (thumbnail.startsWith("/9j/")) {
    return `data:image/jpeg;base64,${thumbnail}`;
  }

  // PNG images start with iVBORw
  if (thumbnail.startsWith("iVBORw")) {
    return `data:image/png;base64,${thumbnail}`;
  }

  // GIF images start with R0lGOD
  if (thumbnail.startsWith("R0lGOD")) {
    return `data:image/gif;base64,${thumbnail}`;
  }

  // WebP images start with UklGR
  if (thumbnail.startsWith("UklGR")) {
    return `data:image/webp;base64,${thumbnail}`;
  }

  // Default to JPEG if we detect base64-like data (contains only base64 chars)
  if (/^[A-Za-z0-9+/=]+$/.test(thumbnail)) {
    return `data:image/jpeg;base64,${thumbnail}`;
  }

  // Otherwise return as-is (might be a URL path)
  return thumbnail;
}

// Function to generate character file content
function generateCharacterFile(data: CodexData, tokenId: number): string {
  const profile = getLatestProfile(data);

  const name = getCharacterName(data, tokenId);
  const bio = profile?.bio || generateCharacterBio(data);
  const system = generateSystemPrompt(data, tokenId);
  const topics = generateTopics(data);
  const avatar = formatAvatar(data.thumbnail);

  // Use messageExamples from profile if available, otherwise use defaults
  let messageExamples: Array<Array<MessageExample>> = [
    [
      {
        name: "{{user}}",
        content: {
          text: "Tell me about yourself",
        },
      },
      {
        name,
        content: {
          text: `I am ${name}, a DeCC0 NFT character from MOCA's collection. I represent the intersection of art, technology, and culture in the blockchain era.`,
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "What is DeCC0?",
        },
      },
      {
        name,
        content: {
          text: "DeCC0 is a groundbreaking NFT collection that embodies the principles of decentralized creativity. Each character in the collection has a unique story and artistic heritage.",
        },
      },
    ],
  ];

  if (profile?.messageExamples && profile.messageExamples.length > 0) {
    messageExamples = normalizeMessageExamples(profile.messageExamples);
  }

  // Get style from profile
  const styleAll = profile?.style?.all || data.writing_style || [];
  const styleChat = profile?.style?.chat || [];

  // Get plugins from profile, or use defaults
  const plugins = profile?.plugins || [];

  // Build plugins array - use profile plugins if available, otherwise use default conditional logic
  let pluginsCode: string;
  if (plugins.length > 0) {
    // Format plugins array with proper indentation and trailing commas
    const pluginsArray = plugins.map(p => `"${escapeForTypeScript(p)}"`).join(",\n    ");
    pluginsCode = `[\n    ${pluginsArray},\n  ]`;
  } else {
    pluginsCode = `[
    // Core plugins first
    "@elizaos/plugin-sql",

    // Venice plugin (for main text generation)
    ...(process.env.VENICE_API_KEY?.trim() ? [ "@elizaos/plugin-venice" ] : []),

    // Text-only plugins (no embedding support)
    ...(process.env.ANTHROPIC_API_KEY?.trim() ? [ "@elizaos/plugin-anthropic" ] : []),
    ...(process.env.OPENROUTER_API_KEY?.trim() ? [ "@elizaos/plugin-openrouter" ] : []),

    // Embedding-capable plugins (optional, based on available credentials)
    ...(process.env.OPENAI_API_KEY?.trim() ? [ "@elizaos/plugin-openai" ] : []),
    ...(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ? [ "@elizaos/plugin-google-genai" ] : []),

    // Ollama as fallback (only if no main LLM providers are configured)
    ...(process.env.OLLAMA_API_ENDPOINT?.trim() ? [ "@elizaos/plugin-ollama" ] : []),

    // Platform plugins
    ...(process.env.DISCORD_API_TOKEN?.trim() ? [ "@elizaos/plugin-discord" ] : []),
    ...(process.env.TWITTER_API_KEY?.trim()
    && process.env.TWITTER_API_SECRET_KEY?.trim()
    && process.env.TWITTER_ACCESS_TOKEN?.trim()
    && process.env.TWITTER_ACCESS_TOKEN_SECRET?.trim()
      ? [ "@elizaos/plugin-twitter" ]
      : []),
    ...(process.env.TELEGRAM_BOT_TOKEN?.trim() ? [ "@elizaos/plugin-telegram" ] : []),

    // Bootstrap plugin
    ...(!process.env.IGNORE_BOOTSTRAP ? [ "@elizaos/plugin-bootstrap" ] : []),
  ]`;
  }

  return `import type { Character } from "@elizaos/core";

/**
 * DeCC0 Character: ${name} (Token ID: ${tokenId})
 * Generated from codex data on ${new Date().toISOString()}
 */
export const character: Character = {
  name: "${escapeForTypeScript(name)}",
  plugins: ${pluginsCode},
  settings: {
    secrets: {},
    avatar: "${escapeForTypeScript(avatar)}",
  },
  system:
    "${escapeForTypeScript(system)}",
  bio: ${formatStringArray(bio, 4)},
  topics: ${formatStringArray(topics, 4)},
  messageExamples: ${formatMessageExamples(messageExamples, 4)},
  style: {
    all: ${formatStringArray(styleAll, 6)},
    chat: ${formatStringArray(styleChat, 6)},
  },
};
`;
}

// Main generation logic
let successCount = 0;
let errorCount = 0;
const successfulTokenIds: number[] = [];
const missingTokenIds: number[] = [];

for (const tokenId of tokenIds) {
  const codexUrl = `${API_BASE_URL}/codex/${tokenId}`;

  try {
    console.log(`🌐 Fetching codex from Directus API for token ID ${tokenId}...`);

    // Fetch codex data from Directus API
    const response = await fetch(codexUrl);

    if (!response.ok) {
      if (response.status === 404) {
        console.error(`⚠️  Codex file not found for token ID ${tokenId}: ${codexUrl}`);
        missingTokenIds.push(tokenId);
        errorCount++;
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const apiResponse = await response.json();

    // Extract codex data from API response
    if (!apiResponse.success || !apiResponse.data) {
      throw new Error("Invalid API response format");
    }

    const codexData: CodexData = apiResponse.data;

    // Generate character file
    const characterFilename = `decc0_${tokenId}.ts`;
    const characterPath = join(CHARACTERS_DIR, characterFilename);
    const characterContent = generateCharacterFile(codexData, tokenId);

    // Write character file
    writeFileSync(characterPath, characterContent, "utf-8");

    const name = getCharacterName(codexData, tokenId);
    console.log(`✅ Generated character for ${name} (Token ID: ${tokenId})`);
    successCount++;
    successfulTokenIds.push(tokenId);
  } catch (error) {
    console.error(`❌ Error generating character for token ID ${tokenId}:`, error);
    errorCount++;
  }
}

// Clean up old character files
console.log("\n🧹 Cleaning up old character files...");
const allFiles = readdirSync(CHARACTERS_DIR);
const decc0Files = allFiles.filter(file => file.startsWith("decc0_") && file.endsWith(".ts"));

let deletedCount = 0;
for (const file of decc0Files) {
  // Extract token ID from filename (e.g., decc0_1.ts -> 1)
  const match = file.match(/decc0_(\d+)\.ts/);
  if (match) {
    const fileTokenId = Number.parseInt(match[1], 10);
    // Only keep files for successfully generated characters
    if (!successfulTokenIds.includes(fileTokenId)) {
      const filePath = join(CHARACTERS_DIR, file);
      unlinkSync(filePath);
      console.log(`🗑️  Deleted: ${file}`);
      deletedCount++;
    }
  }
}

// Update index.ts with character imports
console.log("\n📝 Updating index.ts with character imports...");
const INDEX_PATH = join(__dirname, "src", "index.ts");

try {
  // Sort token IDs for consistent ordering (only use successfully generated ones)
  const sortedTokenIds = [ ...successfulTokenIds ].sort((a, b) => a - b);

  // Read current index.ts
  const currentContent = readFileSync(INDEX_PATH, "utf-8");
  const lines = currentContent.split("\n");

  // Find key line indices to identify sections
  let coreImportEnd = -1;
  let pluginImportStart = -1;
  let pluginImportEnd = -1;
  let arrayStart = -1;
  let arrayEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Find end of core @elizaos/core import block
    if (line.includes("} from \"@elizaos/core\";")) {
      coreImportEnd = i;
    }

    // Find plugin imports
    if (line.includes("import starterPlugin")) {
      pluginImportStart = i;
    }
    if (line.includes("import r2rRAGPlugin")) {
      pluginImportEnd = i;
    }

    // Find array declaration
    if (line.includes("const decc0Characters: Character[] = [")) {
      arrayStart = i;
    }
    if (arrayStart !== -1 && arrayEnd === -1 && line.includes("];")) {
      arrayEnd = i;
    }
  }

  // Validate that we found all necessary sections
  if (coreImportEnd === -1 || pluginImportStart === -1 || pluginImportEnd === -1 || arrayStart === -1 || arrayEnd === -1) {
    throw new Error("Could not find required sections in index.ts");
  }

  // Build the new file content
  const newLines: string[] = [];

  // 1. Core imports (up to and including @elizaos/core import)
  newLines.push(...lines.slice(0, coreImportEnd + 1));
  newLines.push("");

  // 2. Plugin imports (these should stay the same)
  newLines.push("import starterPlugin from \"./plugin.ts\";");
  newLines.push("import coingeckoPlugin from \"./plugins/coingecko.ts\";");
  newLines.push("import r2rRAGPlugin from \"./plugins/r2r-rag.ts\";");

  // 3. Character imports (only if we have characters to import)
  if (sortedTokenIds.length > 0) {
    newLines.push("");
    newLines.push("// Import all DeCC0 characters statically");
    for (const id of sortedTokenIds) {
      newLines.push(`import { character as decc0_${id} } from \"./characters/decc0_${id}.ts\";`);
    }
  }

  // 4. Array comment and declaration
  newLines.push("");
  newLines.push("/**");
  newLines.push(" * Array of all DeCC0 characters");
  newLines.push(" */");
  newLines.push("const decc0Characters: Character[] = [");
  if (sortedTokenIds.length > 0) {
    for (const id of sortedTokenIds) {
      newLines.push(`  decc0_${id},`);
    }
  }
  newLines.push("];");

  // 5. Rest of the file (after the array closing bracket)
  newLines.push(...lines.slice(arrayEnd + 1));

  // Write updated content
  const newContent = newLines.join("\n");
  writeFileSync(INDEX_PATH, newContent, "utf-8");
  console.log(`✅ Updated index.ts with ${sortedTokenIds.length} character import(s)`);
} catch (error) {
  console.error("❌ Error updating index.ts:", error);
  throw error;
}

// Summary
console.log("");
console.log("=".repeat(60));
console.log("📊 Generation Summary:");
console.log(`   ✅ Successfully generated: ${successCount} character(s)`);
if (successfulTokenIds.length > 0) {
  console.log(`      Token IDs: ${successfulTokenIds.sort((a, b) => a - b).join(", ")}`);
}
if (missingTokenIds.length > 0) {
  console.log(`   ⚠️  Missing codex files: ${missingTokenIds.length}`);
  console.log(`      Token IDs: ${missingTokenIds.sort((a, b) => a - b).join(", ")}`);
}
if (errorCount > missingTokenIds.length) {
  console.log(`   ❌ Other errors: ${errorCount - missingTokenIds.length}`);
}
console.log(`   🗑️  Deleted: ${deletedCount} old character file(s)`);
console.log("=".repeat(60));

// Exit with error only if no characters were successfully generated
if (successCount === 0) {
  console.error("\n❌ No characters were successfully generated. Exiting with error.");
  process.exit(1);
} else if (missingTokenIds.length > 0) {
  console.log("\n⚠️  Some token IDs were not found, but successfully generated characters have been processed.");
}
