#!/usr/bin/env bun
/**
 * DeCC0 Character Generator
 *
 * This script generates ElizaOS character files for DeCC0 NFTs based on their codex data.
 *
 * Usage:
 *   bun run generate-characters.ts 1,5,10
 *   bun run generate-characters.ts 1 5 10
 *
 * This will:
 * - Read codex data from codex/Art_DeCC0_XXXXX.codex.json files
 * - Generate character files in src/characters/decc0_TOKENID.ts
 * - Delete any existing decc0_*.ts files that weren't specified
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CodexData {
  id: number;
  name: string[];
  adjectives?: string[];
  background?: string;
  background_ipfs?: string;
  background_or_foreground?: string;
  background_texture?: string;
  bgthumbnail?: string;
  biography?: string | string[];
  character_image_description?: string;
  character_image_summary?: string;
  character_ipfs?: string;
  citation?: string;
  cultural_affiliation?: string;
  dna1?: string;
  dna2?: string;
  dna3?: string;
  dna4?: string;
  favorite_book?: string;
  favorite_cryptoartist?: string;
  final_ipfs?: string;
  gender?: string;
  mood?: string;
  multiplicity?: string;
  pairedart_image_description?: string;
  pairedart_image_summary?: string;
  soul?: number;
  thumbnail?: string;
  timestamp?: string;
  type?: string;
  v001_adjectives?: string[];
  v001_bio?: string[];
  v001_description?: string;
  v001_name?: string;
  v001_style?: string[];
  v001_system?: string;
  v001_timestamp?: string;
  v001_topics?: string[];
  v001_username?: string;
  whatness?: string;
  writing_style?: string;
}

// Parse command-line arguments for token IDs
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("❌ Error: No token IDs provided");
  console.log("Usage: bun run generate-characters.ts 1,5,10");
  console.log("   or: bun run generate-characters.ts 1 5 10");
  process.exit(1);
}

// Parse token IDs from comma-separated or space-separated format
const tokenIds: number[] = args
  .join(",")
  .split(",")
  .map(id => id.trim())
  .filter(id => id !== "")
  .map(id => Number.parseInt(id, 10))
  .filter(id => !Number.isNaN(id));

if (tokenIds.length === 0) {
  console.error("❌ Error: No valid token IDs found");
  process.exit(1);
}

console.log(`🎭 Generating characters for token IDs: ${tokenIds.join(", ")}`);

const __dirname = dirname(fileURLToPath(import.meta.url));
const CODEX_DIR = join(__dirname, "codex");
const CHARACTERS_DIR = join(__dirname, "src", "characters");

// Ensure the characters directory exists
if (!existsSync(CHARACTERS_DIR)) {
  mkdirSync(CHARACTERS_DIR, { recursive: true });
  console.log(`📁 Created characters directory: ${CHARACTERS_DIR}`);
}

// Function to format token ID to match codex filename pattern
function formatTokenId(tokenId: number): string {
  return tokenId.toString().padStart(5, "0");
}

// Function to generate a character name from codex data
function getCharacterName(data: CodexData): string {
  if (data.name && Array.isArray(data.name) && data.name.length > 0) {
    return data.name[0];
  }
  return `DeCC0 #${data.id}`;
}

// Function to generate character bio from codex data
function generateCharacterBio(data: CodexData): string[] {
  const bio: string[] = [];

  if (data.biography) {
    // Biography might be a string or array, handle both cases
    if (Array.isArray(data.biography)) {
      bio.push(...data.biography);
    } else {
      bio.push(data.biography);
    }
  }

  if (data.cultural_affiliation) {
    bio.push(`Cultural Background: ${data.cultural_affiliation}`);
  }

  if (data.dna1 || data.dna2 || data.dna3 || data.dna4) {
    const dna = [ data.dna1, data.dna2, data.dna3, data.dna4 ].filter(Boolean).join(", ");
    if (dna) {
      bio.push(`Artistic DNA: ${dna}`);
    }
  }

  return bio;
}

// Function to generate system prompt
function generateSystemPrompt(data: CodexData): string {
  const name = getCharacterName(data);
  let prompt = `You are ${name}, a DeCC0 NFT character from the Museum of Crypto Art (M○C△).\n\n`;

  if (data.biography) {
    // Biography might be a string or array, handle both cases
    const bioText = Array.isArray(data.biography) ? data.biography.join("\n\n") : data.biography;
    prompt += `${bioText}\n\n`;
  }

  if (data.cultural_affiliation) {
    prompt += `You are rooted in ${data.cultural_affiliation} culture.\n\n`;
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
  const topics: string[] = [
    "DeCC0 NFT collection",
    "Crypto art and NFT culture",
    "MOCA's mission and collection",
    "Blockchain technology and art",
  ];

  if (data.cultural_affiliation) {
    topics.push(`${data.cultural_affiliation} culture and art`);
  }

  if (data.favorite_cryptoartist) {
    topics.push("Favorite crypto artists");
  }

  if (data.favorite_book) {
    topics.push("Literature and art");
  }

  return topics;
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

// Function to generate character file content
function generateCharacterFile(data: CodexData, tokenId: number): string {
  const name = getCharacterName(data);
  const bio = generateCharacterBio(data);
  const system = generateSystemPrompt(data);
  const topics = generateTopics(data);
  const avatar = data.thumbnail || "";

  return `import type { Character } from "@elizaos/core";

/**
 * DeCC0 Character: ${name} (Token ID: ${tokenId})
 * Generated from codex data on ${new Date().toISOString()}
 */
export const character: Character = {
  name: "${escapeForTypeScript(name)}",
  plugins: [
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
  ],
  settings: {
    secrets: {},
    avatar: "${escapeForTypeScript(avatar)}",
  },
  system:
    "${escapeForTypeScript(system)}",
  bio: ${JSON.stringify(bio, null, 2).replace(/("\n\])/, "\",\n]").split("\n").join("\n  ")},
  topics: ${JSON.stringify(topics, null, 2).replace(/("\n\])/, "\",\n]").split("\n").join("\n  ")},
  messageExamples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Tell me about yourself",
        },
      },
      {
        name: "${escapeForTypeScript(name)}",
        content: {
          text: "I am ${escapeForTypeScript(name)}, a DeCC0 NFT character from MOCA's collection. I represent the intersection of art, technology, and culture in the blockchain era.",
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
        name: "${escapeForTypeScript(name)}",
        content: {
          text: "DeCC0 is a groundbreaking NFT collection that embodies the principles of decentralized creativity. Each character in the collection has a unique story and artistic heritage.",
        },
      },
    ],
  ],
  style: {
    all: [
      "Be expressive and authentic to your character",
      "Share insights about crypto art and culture",
      "Reference your cultural background when relevant",
      "Engage thoughtfully with questions about art and technology",
    ],
    chat: [
      "Be conversational and approachable",
      "Share your unique perspective as a DeCC0 character",
      "Encourage exploration of MOCA's collection",
    ],
  },
};
`;
}

// Main generation logic
let successCount = 0;
let errorCount = 0;

for (const tokenId of tokenIds) {
  const formattedId = formatTokenId(tokenId);
  const codexFilename = `Art_DeCC0_${formattedId}.codex.json`;
  const codexPath = join(CODEX_DIR, codexFilename);

  if (!existsSync(codexPath)) {
    console.error(`❌ Codex file not found for token ID ${tokenId}: ${codexPath}`);
    errorCount++;
    continue;
  }

  try {
    // Read and parse codex data
    const codexData: CodexData = JSON.parse(readFileSync(codexPath, "utf-8"));

    // Generate character file
    const characterFilename = `decc0_${tokenId}.ts`;
    const characterPath = join(CHARACTERS_DIR, characterFilename);
    const characterContent = generateCharacterFile(codexData, tokenId);

    // Write character file
    writeFileSync(characterPath, characterContent, "utf-8");

    const name = getCharacterName(codexData);
    console.log(`✅ Generated character for ${name} (Token ID: ${tokenId})`);
    successCount++;
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
    if (!tokenIds.includes(fileTokenId)) {
      const filePath = join(CHARACTERS_DIR, file);
      unlinkSync(filePath);
      console.log(`🗑️  Deleted: ${file}`);
      deletedCount++;
    }
  }
}

// Summary
console.log("");
console.log("=".repeat(60));
console.log("📊 Generation Summary:");
console.log(`   ✅ Successfully generated: ${successCount} character(s)`);
console.log(`   ❌ Errors: ${errorCount}`);
console.log(`   🗑️  Deleted: ${deletedCount} old character file(s)`);
console.log("=".repeat(60));

if (errorCount > 0) {
  process.exit(1);
}
