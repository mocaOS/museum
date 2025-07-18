<div align="center">
  <img src="https://github.com/mocaOS/museum/blob/main/misc/social.jpg" />
</div>

---

# MOCA. Museum of Crypto Art

A comprehensive platform for the Museum of Crypto Art (M○C△) - the community-driven digital cryptoart museum. Our mission is to preserve the truth and present a broad representation of perspectives that challenge and provoke discourse around digital art and culture.

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