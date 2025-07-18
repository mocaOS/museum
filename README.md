<div align="center">
  <img src="https://git.qwellco.de/moca/moca-migration/-/raw/main/misc/social.jpg" />
</div>

---

# MOCA Monorepo

This is a Turborepo-based monorepo containing the MOCA platform projects.

## Requirements
- NVM (Node Version Manager)
- Node.js version: >= v22.14.0
- yarn package manager
- bun package manager for `apps/scripts`

## Setup

### Docker Setup
The project uses Docker and Docker Compose for containerized development:

```bash
# Start all services with Docker Compose
docker-compose up -d
```

This command starts the following services:
- PostgreSQL database (moca-postgres)
- Redis server (moca-redis)

### Directus Configuration Sync
After starting the Directus API service, you need to push the latest database schemas and configurations:

```bash
# Start Directus
npx directus start

# Apply latest database schemas and configurations
npx directus-sync push
```

This ensures that your local Directus instance has the most up-to-date schema, collections, fields, and other configurations.

## Projects

### 🌐 Web (Frontend)
A Nuxt 3 application that serves as the main frontend for MOCA.

**Tech Stack:**
- Nuxt 3
- Vue 3
- TypeScript
- TailwindCSS
- Shadcn UI
- Web3 Integration:
  - Wagmi
  - Ethers.js
  - Viem
  - Solana Web3.js
- Data Fetching:
  - Tanstack Vue Query
  - Directus SDK
  - Axios

### ⚙️ API (Backend)
A Directus-powered API for data management and content delivery.

**Tech Stack:**
- Directus 11
- PostgreSQL
- Node.js
- Custom Directus extensions

#### Environment Configuration
The API uses environment variables for configuration. Copy the provided `.env.example` file to get started:

```bash
# Navigate to the API directory
cd apps/api

# Copy the example .env file
cp .env.example .env

# Edit the .env file with your values
```

The `.env.example` includes configuration for:
- Database connection (PostgreSQL)
- Redis settings
- Admin credentials
- Security settings
- File storage options
- Email configuration
- API access settings

#### Patches
The project includes a patch for Directus to enable Web3 authentication:
- `patches/@directus+api+25.0.1.patch`: Modifies the Directus authentication service to support Ethereum wallet authentication via message signing. This patch allows users to sign in using their Ethereum wallet without a password.

### 📜 Scripts
Utility scripts for various administrative tasks.

**Tech Stack:**
- TypeScript
- Bun Runtime
- Directus SDK
- Axios
- CSV parsing utilities

#### NFT Import Script
The `apps/scripts/index.ts` script imports NFT data from a CSV file into the Directus database.

**Functionality:**
- Reads NFT data from a CSV file
- Creates contract and NFT records in Directus
- Tracks and reports import statistics

**Usage:**
```bash
# Navigate to the scripts directory
cd apps/scripts

# Configure the script
# Edit the CSV_FILE_PATH, DIRECTUS_URL, and DIRECTUS_TOKEN variables in the script

# Run the script
bun run index.ts
```

**Environment Configuration:**
The script requires environment variables that can be set in a `.env` file. Copy the provided `.env.example` file:

```bash
# Copy the example .env file
cp .env.example .env

# Edit the .env file with your values
```

Required environment variables:
- `CSV_FILE_PATH`: Path to your CSV data file
- `DIRECTUS_URL`: URL of your Directus instance (default: http://localhost:8055)
- `DIRECTUS_TOKEN`: Admin API token for Directus authentication

## Development

To run the development server:

## Development

To run the development server:

```bash
# Install dependencies
yarn install

# Start all projects
yarn dev

# Start only the web app and its dependencies
yarn dev:web
```

## Build

To build all apps and packages:

```bash
yarn build
```