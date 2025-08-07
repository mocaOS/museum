# MOCA Agent Plugins

A collection of ElizaOS plugins for the MOCA (Museum of Crypto Art) agent.

## Available Plugins

### 1. NFT Directus Plugin

An ElizaOS plugin that fetches NFT information from a Directus backend using the public REST API.

### 2. R2R RAG Plugin

An ElizaOS plugin that provides retrieval-augmented generation capabilities using the R2R (SciPhi-AI) backend.

---

## NFT Directus Plugin

An ElizaOS plugin that fetches NFT information from a Directus backend using the public REST API.

## Features

- **Search by Artist**: Find NFTs created by specific artists
- **Search by Name**: Find NFTs by their name or title
- **Search by Collection**: Find NFTs within specific collections
- **Contextual Provider**: Supplies available collections and search capabilities to the agent

## Configuration

Set the following environment variable to configure the Directus backend URL:

```bash
DIRECTUS_URL=http://localhost:8055
```

If not set, it defaults to `http://localhost:8055`.

## Usage Examples

The plugin responds to natural language queries about NFTs:

### Search by Artist
- "Find NFTs by artist Pak"
- "Show me artworks by Beeple"
- "NFTs created by CryptoPunks"

### Search by Collection
- "Show me NFTs from Genesis Collection"
- "Art in the Permanent Collection"
- "NFTs from collection Fundraiser"

### Search by Name
- "Find the NFT called 'The Pixel'"
- "Show me artwork named 'First Light'"
- "Look for token 'Digital Artifact #1'"

## API Integration

The plugin uses Directus REST API endpoints:

- `GET /items/nfts` - Search NFTs with filters
- `GET /items/nfts/{id}` - Get specific NFT by ID
- `GET /items/collections` - Get available collections

### Search Parameters

The plugin automatically extracts search parameters from natural language:

- **Artist queries**: Looks for patterns like "artist X", "by X"
- **Collection queries**: Looks for patterns like "collection X", "from X"  
- **Name queries**: Looks for patterns like "NFT X", "artwork X", quoted strings

### Response Format

NFT results are formatted with:
- NFT name (bolded)
- Artist name
- Collection name
- Contract address
- Token ID

## Data Model

Based on the Directus schema, the plugin works with:

### NFTs (`nfts` table)
- `id`: Unique identifier
- `name`: NFT name/title
- `artist_name`: Creator/artist name
- `collection`: Reference to collections table
- `contract`: Reference to contracts table
- `identifier`: Token ID

### Collections (`collections` table)
- `id`: Unique identifier
- `name`: Collection name
- `title`: Display title
- `description`: Collection description

### Contracts (`contracts` table)
- `address`: Contract address
- `name`: Contract name
- `chain`: Blockchain network

## Technical Details

### Components

1. **DirectusNFTService**: Core service for API interactions
2. **searchNFTsAction**: Action handler for search queries
3. **nftContextProvider**: Provides collection context to the agent

### Error Handling

- Graceful API error handling
- Fallback responses for service unavailability
- Detailed logging for debugging

### Testing

Run tests with:
```bash
bun test src/__tests__/nft-directus.test.ts
```

## Installation

The plugin is automatically loaded when the moca-agent starts. It's registered in `src/index.ts`:

```typescript
import nftDirectusPlugin from "./plugins/nft-directus.ts";

export const projectAgent: ProjectAgent = {
  // ...
  plugins: [starterPlugin, coingeckoPlugin, nftDirectusPlugin],
};
```

## Development

To modify or extend the plugin:

1. Edit `/apps/moca-agent/src/plugins/nft-directus.ts`
2. Add tests in `/apps/moca-agent/src/__tests__/nft-directus.test.ts`
3. Run `bun run build` to compile
4. Run `bun run dev` for development mode with hot reload

## Dependencies

- `@elizaos/core`: ElizaOS framework
- Native `fetch` API for HTTP requests
- TypeScript for type safety

---

## R2R RAG Plugin

An ElizaOS plugin that integrates with R2R (Retrieval-Augmented Generation) backend to provide intelligent question-answering and document search capabilities.

### Features

- **Question Answering**: Ask natural language questions and receive informed answers based on available documents
- **Semantic Search**: Search through documents using semantic understanding rather than just keyword matching  
- **Document Retrieval**: Find relevant documents and passages based on queries
- **Conversation Management**: Maintains conversation context for follow-up questions
- **Citation Support**: Provides source information for generated responses

### Configuration

Set the following environment variables to configure the R2R backend:

```bash
R2R_URL=http://localhost:7272
R2R_API_KEY=your-api-key-here
```

If not set, defaults to `http://localhost:7272` with no API key.

### Usage Examples

The plugin responds to natural language queries about any topic in the knowledge base:

#### Question Answering
- "What is the nature of consciousness?"
- "How does machine learning work?"
- "Tell me about blockchain technology"
- "Explain quantum computing"
- "What are the origins of cryptoart?"

#### Document Search
- "Search for documents about artificial intelligence"
- "Find content about climate change"
- "Search for information about Web3"
- "Look for papers on neural networks"

#### Follow-up Questions
- "Can you explain that in more detail?"
- "What are the implications of this?"
- "How does this relate to [other topic]?"

### API Integration

The plugin uses the R2R JavaScript client (`r2r-js`) to communicate with the R2R backend:

- **Health Check**: Tests connection to R2R server
- **Conversation Management**: Creates and manages conversation sessions
- **Semantic Search**: Performs vector-based document search
- **RAG Queries**: Combines retrieval and generation for informed responses
- **Result Formatting**: Processes and formats responses with citations

### Response Format

Responses include:
- **Answer**: Generated response based on retrieved documents
- **Sources**: Relevant document excerpts with source attribution
- **Citations**: Reference information for fact-checking

### Technical Details

#### Components

1. **R2RService**: Core service for R2R API interactions
2. **askR2RAction**: Action handler for question-answering queries
3. **searchR2RAction**: Action handler for document search queries
4. **r2rContextProvider**: Provides R2R capabilities context to the agent

#### Search Configuration

- **Semantic Search**: Enabled by default for better understanding
- **Hybrid Search**: Optional combination of semantic and keyword search
- **Result Limits**: Configurable number of results (default: 4-10)
- **Temperature**: Controls randomness in generated responses (default: 0.1)
- **Token Limits**: Maximum response length (default: 1024 tokens)

#### Error Handling

- Connection testing before queries
- Graceful fallbacks for service unavailability  
- Detailed error logging for debugging
- User-friendly error messages

#### Conversation Context

- Automatic conversation creation for context retention
- Session management for multi-turn conversations
- Conversation reset functionality

### Installation

Add the plugin to your agent configuration in `src/index.ts`:

```typescript
import r2rRAGPlugin from "./plugins/r2r-rag.ts";

export const projectAgent: ProjectAgent = {
  // ...
  plugins: [starterPlugin, coingeckoPlugin, nftDirectusPlugin, r2rRAGPlugin],
};
```

### Development

To modify or extend the plugin:

1. Edit `/apps/moca-agent/src/plugins/r2r-rag.ts`
2. Add tests in `/apps/moca-agent/src/__tests__/r2r-rag.test.ts`
3. Run `bun run build` to compile
4. Run `bun run dev` for development mode with hot reload

### Dependencies

- `@elizaos/core`: ElizaOS framework
- `r2r-js`: R2R JavaScript client library
- TypeScript for type safety

### Integration with Existing R2R Implementation

This plugin complements the existing R2R implementation in the web app (`apps/web/`):

- **Web Implementation**: Interactive chat interface for users
- **Agent Plugin**: Programmatic access for the AI agent
- **Shared Backend**: Both use the same R2R service for consistency

The plugin can be used alongside the web implementation to provide:
- Agent-driven research capabilities
- Automated document analysis
- Context-aware responses in conversations
- Integration with other agent plugins (like NFT search)
