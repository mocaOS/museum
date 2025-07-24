<div align="center">
  <img src="https://github.com/mocaOS/museum/blob/main/misc/social.jpg" />
</div>

---

# The MOCA Tech Stack

At the Museum of Crypto Art (MOCA), we’ve reimagined what it means to be a Museum, bringing immersive art exhibitions, free tooling and software, high-level scholarship, and an engaging community atmosphere to a purely-online museum. MOCA is an industry leader in adapting new technologies —metaverse, blockchain, and AI— for practical application in a cultural institution.

We, however, envision a broader future, in which *any* cultural institution can deploy its own AI-powered museum. Therein, visitors can interact with curated and immersive exhibits alongside one another and alongside personalized AI agents, acting as curators and tour guides, each personalized to fit a given institution’s vibe.

Welcome to our open-source museum tech stack, and the unprecedented possibilities it presents for cultural institutions forever.

Our mission, put simply: Provide a fully-deployable museum codebase where any enthusiast, collector, or cultural body can summon a top-tier curatorial, exhibitive, architectural, and artistic museum experience with ease. We’re not just sharing software; we’re democratizing access to a new paradigm in art experience.

Find a demo at 

[https://v2.museumofcryptoart.com](https://v2.museumofcryptoart.com)

## The Code Base

We began working on this particular code base in early 2025 and already shipped an MVP that ties our Art Collections and Library into a unified stack. As we continue to build new features, we continue the process of migrating legacy code into our new codebase.

This codebase is designed to enable any museum to deploy our tech for themselves. Meanwhile, MOCA as an organization is able to facilitate functionalities (which) are closely tied to $MOCA tokenomics) into their own deployment of this tech stack.

Here is a sample of what we’re offering thus far:

1. **Art Collections**: Import and organize your artworks or NFTs into the backend and categorize them into collections. Your configured art is displayed in the frontend, as the APIs serve metadata + media, i.e. images, videos, 3D models.

2. **The Library**: An AI retrieval system for all documents—or an agentic search-engine for your content. Built around [R2R](https://github.com/SciPhi-AI/R2R), it enables entity-based knowledge graphs for high-end data extraction. The Library plugs into a backend via SDK so that uploaded documents are automatically aggregated to the Library UX.

3. **MOCA ROOMs**: Originally launched in 2022, this [modular architecture](https://hackmd.io/@reneil1337/moca) enables the exhibition and transportation of entire art exhibitions across immersive worlds. Upon deployment, all CC0 MOCA ROOMs are automatically populated into your museum instance, setting the baseline for your interoperable museum architecture.
   
   - WIP: Building out [Hyperfy](https://github.com/hyperfy-xyz/hyperfy) Integration with aims to enable a user-friendly way to manage ROOMs—e.g. positioning and scaling NFT-display slots in a way that exhibitions can be manipulated hassle-free, as well as a novel storage-mix that combines museum backends and .hyp files to enable retrieval of all ROOM configurations into any given world.

4. **Art DeCC0s**: Art Decc0s are 10,000 uniquely generated [CC0 PFPs](https://opensea.io/collection/art-decc0s), and the future face of agentic capabilities which will be woven throughout the software stack. Fueled by [ElizaOS](https://github.com/elizaOS/eliza), these unique personas bridge a given museum into social media, chat applications, and virtual worlds. They are enabled with all knowledge from your Library.
   
   - WIP: Building the MOCA Plugin for ElizaOS and allowing Art Decc0 holders to launch agents which are pre-configured according to unique, generated personas.
   
   - TBD: Integrating into MOCA ROOMs via [Eliza3D](https://github.com/elizaOS/eliza-3d-hyperfy-starter), enabling DeCC0s to spawn in Hyperfy as interactive NPCs.

Regarding Intelligence: We highly recommend fueling Library and agents via [comput3](https://comput3.ai/). Our own deployment uses Hermes3:70b by [Nous Research](https://nousresearch.com/), and we love it. Holders of DeCC0 NFTs don’t need to worry about this, as the official MOCA deployment enables them with free Hermes3 intelligence out-of-the-box.

### Deploy Your Own Museum

Our technical documentation is still under construction. Like a grand gallery being prepped for its opening night, we’re a work in progress. As we implement and refine the features outlined in this repo (from AI-driven ROOMs to DeCC0 agents and The Library), we’ll be continuously improving the docs to make every subsection clearer, more comprehensive, and easier to deploy for institutions and individuals alike.

This is a collaborative experiment, and we’re building the scaffolding in public. If you’re eager to dive deeper, contribute, or deploy your own museum stack, [hop into our Discord](https://discord.gg/Rs7wxUTrWV)—we’ll guide you through the maze while we write the map.

## 🏗️ Architecture

This project is built as a **Turborepo monorepo** containing multiple interconnected applications and shared packages for the MOCA ecosystem.

## 📋 Requirements

- **Node.js**: >= v22.14.0
- **Package Managers**: 
  - `yarn` (primary package manager)
  - `bun` (for scripts and migration tools)
- **Docker & Docker Compose** (for local development)
- **NVM** (Node Version Manager - recommended)

## ⚡ Quick Setup

### 1. Docker Services

Start the required database and cache services:

```bash
# Start PostgreSQL and Redis containers
docker-compose up -d
```

### 2. Install Dependencies

```bash
# Install all workspace dependencies
yarn install
```

### 3. API Configuration

```bash
# Navigate to API directory and configure environment
cd apps/api
cp .env.example .env
# Edit .env with your configuration

# Apply Directus schema and configurations
npx directus start &
npx directus-sync push
```

### 4. Development

```bash
# Start all applications
yarn dev

# Or start only web app and dependencies
yarn dev:web
```

## 🏛️ Applications

### 🌐 **Web Frontend** (`apps/web`)

The main user-facing application built with modern web technologies.

**Key Features:**

- **NFT Collection Browser**: Explore curated crypto art collections with advanced filtering and search
- **AI Librarian Chat**: Interactive chat interface powered by R2R (Retrieval-Augmented Generation) for questions about crypto art and Web3 culture
- **3D Exhibitions**: Virtual rooms and spaces for immersive art experiences
- **Web3 Integration**: Multi-chain wallet support (Ethereum, Polygon, Solana)
- **$MOCA Token**: Token information, claiming, and cross-chain bridging
- **Media Viewer**: Support for images, videos, 3D models, and interactive content

**Tech Stack:**

- **Framework**: Nuxt 3.15+ with Vue 3.5+
- **Styling**: TailwindCSS v4 with custom design system
- **UI Components**: Shadcn/ui with Radix Vue primitives
- **Data Fetching**: TanStack Vue Query + Directus SDK
- **Web3**: Wagmi, ethers.js, Viem, Solana Web3.js, Reown AppKit
- **AI/Search**: R2R integration for semantic search and chat
- **Media**: Nuxt Image with Sharp, 3D model viewing, masonry layouts
- **SEO**: Nuxt SEO with OpenGraph, sitemaps, and meta optimization

### ⚙️ **API Backend** (`apps/api`)

Headless CMS and API built on Directus with custom extensions.

**Features:**

- **Content Management**: Collections, NFTs, rooms, user management
- **Custom Extensions**: MOCA-specific hooks and functionality
- **Web3 Authentication**: Ethereum wallet-based login system
- **Data Sync**: Integration with external APIs (OpenSea, The Graph)
- **R2R Integration**: Document synchronization for AI-powered search
- **Media Processing**: Image optimization and transformation

**Tech Stack:**

- **CMS**: Directus 11.4+
- **Database**: PostgreSQL 17
- **Cache**: Redis 7
- **Extensions**: Custom TypeScript hooks and operations
- **Auth**: Web3 signature-based authentication

**Custom Extensions:**

- `insert-opensea-data`: Automated NFT metadata synchronization
- `r2r-document-sync`: Document indexing for AI search
- `r2r-graph-pull`: The Graph protocol integration

### 📜 **Utility Scripts** (`apps/scripts`)

Administrative and automation tools for platform management.

**Key Scripts:**

- **R2R API Management**: Create, manage, and delete API keys for AI integration
- **CSV Imports**: Flexible NFT data import from various sources
- **Data Processing**: Automated data validation and transformation

**Tech Stack:**

- **Runtime**: Bun
- **APIs**: R2R, Directus, various external services
- **Data Formats**: CSV, JSON processing with validation

## 📦 Shared Packages

### `packages/config`

Environment-specific configuration management for development, staging, and production.

### `packages/types`

Shared TypeScript definitions:

- **Directus**: Auto-generated CMS types
- **OpenSea**: NFT marketplace API types
- **Google Sheets**: Spreadsheet integration types

### `packages/eslint-config-custom`

Standardized ESLint configuration for consistent code quality across the monorepo.

## 🚀 Development Workflows

### Building for Production

```bash
# Build all applications
yarn build

# Deploy (custom deployment script)
yarn deploy
```

### Environment Management

The project supports multiple environments with specific configurations:

- **Development**: Local development with hot reload
- **Staging**: Pre-production testing environment  
- **Production**: Live platform deployment

### Database Management

```bash
# Start Directus API
cd apps/api
npx directus start

# Apply schema changes
npx directus-sync push

# Create database migrations
# Add migration files to apps/api/migrations/
```

### Data Operations

```bash
# Run migration scripts
cd apps/scripts  
bun run index.ts

# Manage R2R API keys
bun run create-r2r-api-key.ts
```

## 🔧 Configuration

### Environment Variables

**API Configuration** (`apps/api/.env`):

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_DATABASE=moca
DB_USER=moca
DB_PASSWORD=moca

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Directus
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong_password
PUBLIC_URL=http://localhost:8055
SECRET_KEY=your_secret_key

# Web3 & External APIs
OPENSEA_API_KEY=your_opensea_key
THEGRAPH_API_KEY=your_graph_key
```

**Web Application** (`apps/web/.env`):

```env
# API Endpoints
NUXT_PUBLIC_DIRECTUS_URL=http://localhost:8055
NUXT_PUBLIC_STRAPI_URL=https://api.museumofcryptoart.com

# R2R Configuration
NUXT_PUBLIC_R2R_BASE_URL=https://r2r.moca.example.com
R2R_API_KEY=your_r2r_api_key

# Web3
REOWN_PROJECT_ID=your_project_id
```

## 🌐 Platform Features

### Digital Art Collections

- **Genesis Collection**: Original MOCA artworks and historical pieces
- **Permanent Collection**: Curated long-term exhibitions
- **Themed Collections**: Special exhibitions and artist showcases
- **Community Collections**: User-contributed and DAO-curated content

### Web3 Integration

- **Multi-Chain Support**: Ethereum, Polygon, Solana networks
- **Wallet Authentication**: Signature-based login without passwords
- **$MOCA Token**: Native token with cross-chain bridging capabilities
- **NFT Display**: Rich metadata and media rendering

### AI-Powered Features

- **Semantic Search**: R2R-powered document and artwork discovery
- **Chat Interface**: Ask questions about crypto art history and culture
- **Content Recommendations**: Intelligent artwork and exhibition suggestions
  ￼

### Virtual Exhibitions

- **3D Rooms**: Immersive virtual gallery spaces
- **Interactive Media**: Support for various digital art formats
- **Virtual Reality**: WebXR-compatible exhibition viewing

## 🛠️ Technical Highlights

### Performance Optimizations

- **Turborepo**: Optimized build and caching system
- **Image Processing**: Automatic optimization and responsive delivery
- **Code Splitting**: Lazy loading and route-based chunks
- **Database Indexing**: Custom indexes for improved query performance

### Security Features

- **Web3 Authentication**: Cryptographic signature verification
- **API Security**: Rate limiting and access control
- **Data Validation**: Comprehensive input sanitization
- **Environment Isolation**: Secure configuration management

### Scalability Considerations

- **Microservice Architecture**: Loosely coupled application components
- **Database Optimization**: Efficient queries and connection pooling
- **CDN Integration**: Global content delivery and caching
- **Horizontal Scaling**: Container-ready deployment architecture

## 📚 Documentation

For detailed technical documentation, see:

- **API Documentation**: Available in Directus admin panel
- **Component Library**: Storybook documentation (when available)
- **Deployment Guide**: See deployment configuration files
- **Contributing Guidelines**: Code conventions and submission process

## 🤝 Contributing

This project follows strict code quality standards:

1. **Code Style**: ESLint configuration with TypeScript strict mode
2. **Commit Standards**: Conventional commits for automated releases
3. **Testing**: Comprehensive test coverage for critical components
4. **Documentation**: Inline code documentation and README updates

## 📄 License

© 2024 Museum of Crypto Art. All rights reserved.

## 🔗 Links

- **Museum**: [museumofcryptoart.com](https://museumofcryptoart.com)
- **Platform**: [v2.museumofcryptoart.com](https://v2.museumofcryptoart.com)
- **Manifesto**: [MOCA Manifesto](https://museumofcryptoart.com/m%E2%97%8Bc%E2%96%B3-manifesto/)

---

*"At its core, the Museum of Crypto Art (M○C△) challenges, creates conflict, provokes. M○C△ puts forward a broad representation of perspectives meant to upend our sense of who we are. It poses two questions: 'what is art?' and 'who decides?'"*