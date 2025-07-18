# scripts

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.2.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

# R2R API Key Creator

A TypeScript script that creates an API key for R2R (Retrieval-Augmented Generation) system.

## Features

- Authenticates with R2R using admin credentials
- **Checks for existing API keys** before creating new ones
- **Generates unique names** to avoid conflicts (e.g., "MOCA R2R API Key (2)")
- Retrieves access token and refresh token
- Creates an actual API key using the access token
- Tests the API key to ensure it's working correctly
- Saves all tokens (access, refresh, and API key) to a JSON file for future use
- Provides usage examples with the generated API key
- Configurable settings for automated or manual operation

## How to Run

1. **First, ensure your `.env` file is configured** (see Configuration section below)
2. Run the script:

```bash
bun run create-r2r-api-key.ts
```

## Configuration

The script is configured using environment variables from the `.env` file:

### Required Environment Variables
- **R2R_BASE_URL**: R2R instance URL (e.g., `https://r2r.moca.qwellco.de`)
- **R2R_EMAIL**: Admin email for authentication (e.g., `admin@example.com`)
- **R2R_PASSWORD**: Admin password for authentication (e.g., `change_me_immediately`)

### Optional Environment Variables
- **FORCE_CREATE_NEW**: `false` - Set to `true` to always create new keys without prompts
- **API_KEY_NAME**: `MOCA R2R API Key` - Base name for the API key
- **API_KEY_DESCRIPTION**: `API key for MOCA R2R integration` - Description for the API key

### Environment File Setup
Create or update your `.env` file with:
```env
# Required R2R Configuration
R2R_BASE_URL=https://r2r.moca.qwellco.de
R2R_EMAIL=admin@example.com
R2R_PASSWORD=change_me_immediately

# Optional Configuration
FORCE_CREATE_NEW=false
API_KEY_NAME=MOCA R2R API Key
API_KEY_DESCRIPTION=API key for MOCA R2R integration
```

### Existing Key Handling
- The script automatically detects existing API keys
- If duplicates exist, it generates unique names (e.g., "MOCA R2R API Key (2)")
- Lists all existing keys with their IDs, descriptions, and update times

## Output

The script will:
1. Authenticate and get access/refresh tokens
2. **Check for existing API keys** and list them if found
3. Decide whether to create new or use existing keys
4. If creating new: generate a unique name to avoid conflicts
5. Create an actual API key using the access token
6. Test the API key to ensure it works
7. Create a `r2r-tokens.json` file containing all your tokens:
   - Access token (for authentication)
   - Refresh token (for token renewal)
   - API key (for making API calls)
   - Key ID and public key
8. Display the API key in the console
9. Show usage examples for making API calls

### Example Output with Existing Keys
```
🔍 Checking for existing API keys...
📋 Found 2 existing API key(s):
   1. MOCA R2R API Key (f449a264-8cdb-4425-a4c1-1019e22a9b28)
      Description: API key for MOCA R2R integration
      Updated: 2025-07-03T13:06:16.063558Z
   2. MOCA R2R API Key (c3f5a6e8-829e-41c2-adb8-56758ae538ac)
      Description: API key for MOCA R2R integration
      Updated: 2025-07-03T13:03:51.165297Z

💡 Generated unique name: "MOCA R2R API Key (2)" to avoid conflicts.
```

## Security Note

⚠️ **Important**: The generated tokens file (`r2r-tokens.json`) is automatically added to `.gitignore` to prevent accidental commits. Keep your API key secure and do not share it publicly!

# R2R API Key Deleter

A TypeScript script that deletes all API keys for a user from the R2R (Retrieval-Augmented Generation) system.

## Features

- Authenticates with R2R using admin credentials
- Lists all existing API keys for the user
- Deletes all API keys with confirmation protection
- Provides detailed deletion summary and logging
- Saves a deletion log to a JSON file for audit purposes
- Robust error handling for individual key deletion failures

## How to Run

1. **First, ensure your `.env` file is configured** (see Configuration section below)
2. Run the script:

```bash
bun run delete-r2r-api-keys.ts
```

## Configuration

The script uses the same environment variables as the creator script:

### Required Environment Variables
- **R2R_BASE_URL**: R2R instance URL (e.g., `https://r2r.moca.qwellco.de`)
- **R2R_EMAIL**: Admin email for authentication (e.g., `admin@example.com`)
- **R2R_PASSWORD**: Admin password for authentication (e.g., `change_me_immediately`)

### Safety Configuration
- **CONFIRM_DELETE**: `false` - **MUST be set to `true` to actually delete keys**

### Environment File Setup
Create or update your `.env` file with:
```env
# Required R2R Configuration
R2R_BASE_URL=https://r2r.moca.qwellco.de
R2R_EMAIL=admin@example.com
R2R_PASSWORD=change_me_immediately

# SAFETY: Set to true to actually delete keys
CONFIRM_DELETE=false
```

## Safety Features

⚠️ **Important Safety Protections**:
- **Confirmation Required**: The script will NOT delete any keys unless `CONFIRM_DELETE=true` is set
- **Detailed Logging**: All deletion attempts are logged to `r2r-deletion-log.json`
- **Individual Error Handling**: If one key fails to delete, the script continues with others
- **Comprehensive Summary**: Shows exactly which keys were deleted and which failed

## Output

The script will:
1. Authenticate and get access token
2. List all existing API keys for the user
3. If `CONFIRM_DELETE=true`: Delete all keys one by one
4. Provide detailed deletion summary
5. Save audit log to `r2r-deletion-log.json`

### Example Output
```
🔍 Retrieving all API keys...
📋 Found 3 API key(s) to delete:
   1. MOCA R2R API Key (f449a264-8cdb-4425-a4c1-1019e22a9b28)
      Description: API key for MOCA R2R integration
      Updated: 2025-07-03T13:06:16.063558Z
   2. MOCA R2R API Key (2) (c3f5a6e8-829e-41c2-adb8-56758ae538ac)
      Description: API key for MOCA R2R integration
      Updated: 2025-07-03T13:03:51.165297Z
   3. Test Key (d7e8f9a0-123b-456c-789d-0123456789ab)
      Description: Test API key
      Updated: 2025-07-03T12:30:00.000000Z

📊 Deletion Summary:
===================
✅ Successfully deleted: 3 API key(s)
   - MOCA R2R API Key (f449a264-8cdb-4425-a4c1-1019e22a9b28)
   - MOCA R2R API Key (2) (c3f5a6e8-829e-41c2-adb8-56758ae538ac)
   - Test Key (d7e8f9a0-123b-456c-789d-0123456789ab)

📄 Deletion log saved to: r2r-deletion-log.json
```

### Dry Run Mode
If you run the script without `CONFIRM_DELETE=true`, it will:
- List all API keys that would be deleted
- Show a warning message
- Exit without deleting anything

## Security Note

⚠️ **Important**: 
- **This action is irreversible** - deleted API keys cannot be recovered
- The deletion log (`r2r-deletion-log.json`) is automatically added to `.gitignore`
- Always review the list of keys before setting `CONFIRM_DELETE=true`
- Consider backing up important API keys before running this script

# CSV to Directus Import Script

This script imports NFT data from CSV files into a Directus database.

## Features

- Reads NFT data from CSV files
- Processes all items in the CSV (no filtering by active status)
- Checks for existing contracts in Directus and creates new ones if needed
- Checks for existing collections in Directus and creates new ones if needed
- Checks for existing NFTs in Directus and creates new ones if needed
- Updates existing NFTs with new collection_type or artist_name if needed
- Provides detailed statistics on import results
- Handles polygon chain conversion to "matic"
- Includes error handling for failed operations

## CSV Format

The CSV file should have the following headers:
```
Artist,Title,Collection,TokenID,Smart Contract Hash,Chain,Note (Max)
```

### Required Fields
- **Artist**: The artist name
- **Collection**: The collection name
- **TokenID**: The token identifier
- **Smart Contract Hash**: The contract address
- **Chain**: The blockchain (e.g., "ethereum", "polygon" - note: "polygon" is converted to "matic")

### Optional Fields
- **Title**: The artwork title (not currently used in import)
- **Note (Max)**: Additional notes (not currently used in import)

## How to Run

1. **Set up your environment variables** (see Configuration section below)
2. Place your CSV file in the scripts directory
3. Run the script:

```bash
bun run index.ts
```

## Configuration

The script is configured using environment variables from the `.env` file:

### Required Environment Variables
- **CSV_FILE_PATH**: Path to the CSV file (relative to the scripts directory)
- **DIRECTUS_URL**: URL of the Directus instance
- **DIRECTUS_TOKEN**: Static token for Directus authentication

### Environment File Setup
Create or update your `.env` file with:
```env
# CSV Import Configuration
CSV_FILE_PATH=data.csv
DIRECTUS_URL=https://your-directus-instance.com
DIRECTUS_TOKEN=your-directus-static-token
```

## Available Data Files

The scripts directory contains several processed CSV files:
- `data.csv` - Main data file (165 rows)
- `converted_Genesis Collection.csv` - Genesis collection data (298 rows)
- `converted_Permanent Collection.csv` - Permanent collection data (43 rows)
- `converted_Fundraiser Collection.csv` - Fundraiser collection data (715 rows)
- `converted_Daïm al-Yad Collection.csv` - Daïm al-Yad collection data (146 rows)
- `converted_Matt Kane_ Past, Present, Future.csv` - Matt Kane collection data (170 rows)

To use a different CSV file, update the `CSV_FILE_PATH` environment variable.

## Output

The script will:
1. Read and parse the CSV file
2. Process each item in the CSV
3. For each item:
   - Check if the contract exists, create if needed
   - Check if the collection exists, create if needed
   - Check if the NFT exists, create if needed
   - Update existing NFTs if collection_type or artist_name differs
4. Provide detailed statistics including:
   - Total rows processed
   - Contracts found/created
   - Collections found/created
   - NFTs found/created
   - Lists of newly created items

### Example Output
```
Starting CSV import process...
CSV file successfully processed. Found 165 rows.
Found 165 active items to process.

Processing item: 0x025b0a638768b49901565c39a0c141bdb52cc06f (0x025b0a638768b49901565c39a0c141bdb52cc06f:234)
Contract 0x025b0a638768b49901565c39a0c141bdb52cc06f is not in Directus Database. Creating...
Contract 0x025b0a638768b49901565c39a0c141bdb52cc06f created in Directus Database
Collection Act I: Contractual Obligations is not in Directus Database. Creating...
Collection Act I: Contractual Obligations created in Directus Database
NFT 234 of 0x025b0a638768b49901565c39a0c141bdb52cc06f is not in Directus Database. Creating...
NFT 234 of 0x025b0a638768b49901565c39a0c141bdb52cc06f created in Directus Database

--- Import Statistics ---
Total rows processed: 165
Active items found: 165
Contracts found in database: 162
Contracts created: 3
Collections found in database: 161
Collections created: 4
NFTs found in database: 150
NFTs created: 15

Contracts created:
- 0x025b0a638768b49901565c39a0c141bdb52cc06f
- 0x83311d111431405380ec1d56ffa1891b8462e9b4
- 0x96ca803f9d7d4f88cd17de6de1cfe3d33e557f28

Collections created:
- Act I: Contractual Obligations
- Act II: Milk & Cookies
- Act III: Free Matt Kane
- Genesis Collection

NFTs created (contract:tokenId):
- 0x025b0a638768b49901565c39a0c141bdb52cc06f:234
- 0x025b0a638768b49901565c39a0c141bdb52cc06f:178
- ... (additional NFTs)
```

## Security Note

⚠️ **Important**: 
- Keep your Directus token secure and do not commit it to version control
- The script includes rate limiting (200ms delay between operations) to avoid overwhelming the Directus API
- Always test with a small dataset first before running large imports
- The script will update existing NFTs if their collection_type or artist_name differs from the CSV data
