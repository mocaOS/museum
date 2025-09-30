# DeCC0 Character Generation

This directory contains scripts and utilities for generating ElizaOS character files from the DeCC0 NFT codex data.

## Overview

The `generate-characters.ts` script reads DeCC0 codex JSON files and generates corresponding ElizaOS character TypeScript files in the `src/characters/` directory. The main `src/index.ts` file automatically loads all generated character files and creates agents for each one.

## Usage

### Generate Characters

To generate character files for specific DeCC0 token IDs:

```bash
bun run generate-characters.ts <tokenId1>,<tokenId2>,...
```

**Examples:**

```bash
# Generate a single character
bun run generate-characters.ts 1

# Generate multiple characters
bun run generate-characters.ts 1,11,24

# Generate many characters
bun run generate-characters.ts 1,2,3,4,5,6,7,8,9,10
```

### What the Script Does

1. **Validates Input**: Parses the comma-separated token IDs from the command line
2. **Cleans Directory**: Removes all existing `decc0_*.ts` files from `src/characters/`
3. **Reads Codex Files**: Looks for `Art_DeCC0_XXXXX.codex.json` files in the `codex/` directory
4. **Generates Characters**: Creates TypeScript character files based on the codex data
5. **Reports Results**: Shows which files were successfully generated

### File Structure

```
apps/moca-agent/
├── codex/                           # Source codex JSON files
│   ├── Art_DeCC0_00001.codex.json
│   ├── Art_DeCC0_00002.codex.json
│   └── ...
├── src/
│   ├── characters/                  # Generated character files
│   │   ├── decc0_1.ts
│   │   ├── decc0_11.ts
│   │   └── ...
│   └── index.ts                     # Dynamically loads all characters
└── generate-characters.ts           # Character generation script
```

### Codex Data Schema

The script expects codex files with the following structure:

```typescript
interface DeCC0Codex {
  type: string;
  decc0_id: number;
  v001_name: string;              // Character name
  v001_bio: string[];             // Character biography
  v001_adjectives: string[];      // Character traits
  v001_topics: string[];          // Topics of expertise
  v001_style: string[];           // Speaking style guidelines
  v001_system: string;            // System prompt
  v001_description: string;       // Character description
  thumbnail?: string;             // Character avatar
  // ... other metadata
}
```

### Generated Character Format

Each generated character file exports a `Character` object compatible with ElizaOS:

```typescript
import { type Character } from "@elizaos/core";

export const character: Character = {
  name: "Character Name",
  plugins: [...],
  settings: {
    secrets: {},
    avatar: "...",
  },
  system: "System prompt...",
  bio: ["Bio lines..."],
  topics: ["Topics..."],
  adjectives: ["Adjectives..."],
  messageExamples: [],
  style: {
    all: ["Style guidelines..."],
    chat: [...],
  },
};
```

### Automatic Loading

The `src/index.ts` file automatically:

1. Scans the `src/characters/` directory for `decc0_*.ts` files
2. Dynamically imports each character module
3. Creates a `ProjectAgent` for each character
4. Adds all agents to the ElizaOS project

This means **no manual imports are needed** - just run the generation script and restart your agent!

## Notes

- Token IDs are padded to 5 digits when looking for codex files (e.g., `1` → `00001`)
- Only token IDs with corresponding codex files will be generated
- The script will skip any token IDs that don't have matching codex files
- All existing `decc0_*.ts` files are deleted before generation to ensure a clean state
- The main MOCA Curator character (from `src/character.ts`) is always included alongside DeCC0 characters

## Development

The script is written in TypeScript and uses Bun for execution. It includes:

- Type definitions from the ElizaOS core package
- File system operations for directory management
- Dynamic character file generation with proper formatting
- Comprehensive logging and error handling

## Example Output

```bash
$ bun run generate-characters.ts 1,11,24

🎯 Processing 3 token ID(s): 1, 11, 24

🧹 Cleaning up existing character files...
   Deleted: decc0_1.ts
   Deleted: decc0_11.ts

📝 Generating new character files...
   ✅ Generated: decc0_1.ts (Namar)
   ✅ Generated: decc0_11.ts (Zephyra)
   ✅ Generated: decc0_24.ts (Kronos)

✨ Successfully generated 3 character file(s)

📋 Generated files:
   - decc0_1.ts
   - decc0_11.ts
   - decc0_24.ts
```

## Troubleshooting

- **"Codex file not found"**: Ensure the token ID corresponds to an existing codex file
- **"No valid token IDs found"**: Check that you're providing comma-separated numbers
- **Import errors**: Make sure all generated files have valid TypeScript syntax
- **Character not loading**: Check the console logs when starting the agent for any import errors
