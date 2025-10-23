# Directus Raw Query Extension

A powerful Directus extension that allows administrators to execute raw SQL queries directly from the Directus admin panel using Monaco Editor.

## Features

### Editor
- 🎨 **Monaco Editor Integration**: Professional SQL editor with syntax highlighting and error detection
- 🔮 **Smart Autocomplete**: Intelligent suggestions for tables, columns, and SQL keywords
- 📊 **Database Schema Awareness**: Fetches your database structure on load for accurate completions
- ⚡ **Keyboard Shortcuts**: Execute queries with `Ctrl/Cmd + Enter`
- 💾 **Auto-save Draft**: Automatically saves your work as you type - resume where you left off

### Query Execution
- 📊 **Multiple Queries**: Execute multiple SQL queries at once (separated by semicolons)
- 📈 **Results Display**: View query results in a clean, tabular format with row counts
- 🎯 **Error Handling**: Clear error messages for failed queries
- 💾 **Database Agnostic**: Works with PostgreSQL, MySQL, and other databases supported by Directus

### Query History
- 📜 **Query History**: Last 50 executed queries stored in sidebar
- 🔄 **One-Click Reload**: Click any history item to load it back into the editor
- 🧹 **Smart Deduplication**: Same query only appears once (most recent execution)
- ⏱️ **Timestamps**: See when each query was executed ("Just now", "5m ago", etc.)
- 🗑️ **Clear History**: Remove all history with one click

### Security & Access
- 🔐 **Admin-Only Access**: Only administrators can access and execute queries

## Installation

The extension is already installed in this monorepo as a workspace dependency:

```json
{
  "devDependencies": {
    "directus-extension-raw-query": "workspace:*"
  }
}
```

## Usage

### Getting Started

1. **Access the Module**: 
   - Log in to Directus as an administrator
   - Navigate to the "Raw Query" module in the sidebar (look for the code icon)

### Writing Queries

2. **Use the Monaco Editor**:
   - Write SQL queries with full syntax highlighting
   - Get intelligent autocomplete suggestions as you type:
     - Table names from your database
     - Column names with their data types
     - SQL keywords and functions
   - Your work is automatically saved as you type
   - Navigate away and return - your query will be restored
   - Write single or multiple queries (separate with semicolons)

### Executing Queries

3. **Run Your Queries**:
   - Click the play button (▶) in the top-right corner
   - Or press `Ctrl/Cmd + Enter` to execute
   - Results appear below the editor in real-time

4. **View Results**:
   - Successful queries show a table with the results
   - Each query displays its row count
   - Failed queries show clear error messages
   - Results preserve newlines for readability

### Using Query History

5. **Query History Sidebar**:
   - Last 50 executed queries are saved automatically
   - Click any query to load it back into the editor
   - Queries show relative timestamps ("5m ago", "2h ago")
   - Duplicate queries are automatically merged (keeps most recent)
   - Clear all history with the "Clear All" button

### Additional Features

6. **Clear Query**: 
   - Click the clear button (✕) to reset the editor
   - This also removes your saved draft

7. **Documentation Links**:
   - Access SQL documentation directly from the navigation sidebar
   - Quick links to Directus query reference and GitHub

## Security

- **Admin-Only**: The extension performs multiple security checks:
  1. User must be authenticated
  2. User must have admin privileges (`req.accountability.admin`)
  3. Module pre-registration check prevents non-admins from seeing it
- **Data Storage**: Query history and drafts are stored in browser localStorage
- **No Password Exposure**: Query results don't expose sensitive fields

## API Endpoints

### Execute Query

The extension exposes a POST endpoint at `/raw-query/execute`:

```typescript
POST /raw-query/execute
Content-Type: application/json

{
  "query": "SELECT * FROM directus_users LIMIT 10;"
}
```

Response:
```json
{
  "success": true,
  "results": [
    {
      "query": "SELECT * FROM directus_users LIMIT 10;",
      "success": true,
      "data": [...],
      "rowCount": 10
    }
  ]
}
```

### Fetch Database Schema

GET endpoint at `/raw-query/schema` to retrieve database structure for autocomplete:

```typescript
GET /raw-query/schema
```

Response:
```json
{
  "success": true,
  "tables": [
    {
      "name": "directus_users",
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "nullable": false
        },
        {
          "name": "email",
          "type": "varchar",
          "nullable": true
        }
      ]
    }
  ]
}
```

## Development

Build the extension:
```bash
bun run build
```

Watch mode for development:
```bash
bun run dev
```

## Architecture

- **Type**: Bundle Extension (contains both endpoint and module)
- **Endpoints**:
  - `/raw-query/execute` (POST) - Handles query execution
  - `/raw-query/schema` (GET) - Fetches database schema for autocomplete
- **Module**: Admin UI with Monaco Editor
- **Technologies**: TypeScript, Vue 3, Monaco Editor
- **Storage**: LocalStorage for query history (last 50) and draft auto-save
- **UI Components**: Uses Directus's built-in UI library for consistent design
- **Autocomplete**: Dynamic SQL completions based on actual database structure

## Example Queries

```sql
-- View all collections
SELECT * FROM information_schema.tables 
WHERE table_schema = 'public';

-- Count items in a collection
SELECT COUNT(*) FROM your_collection_name;

-- Update multiple records
UPDATE directus_users 
SET status = 'active' 
WHERE last_login > NOW() - INTERVAL '30 days';
```

## Troubleshooting

- **Module not visible**: Ensure you're logged in as an administrator
- **Query fails**: Check the error message - it may be a SQL syntax error or permission issue
- **Results not showing**: Ensure your query returns data (SELECT statements)
- **Editor not loading**: Try refreshing the page - Monaco Editor loads dynamically
- **Autocomplete not working**: 
  - Check browser console for schema fetch errors
  - Ensure database has proper permissions for information_schema queries
  - Try refreshing the page to reload schema
- **Draft not restoring**: Check browser localStorage isn't disabled
- **History not saving**: Ensure localStorage has space (stores up to 50 queries)

## LocalStorage Keys

The extension uses the following localStorage keys:
- `directus_raw_query_history`: Stores the last 50 executed queries
- `directus_raw_query_draft`: Stores the current editor content for auto-restore

To clear all stored data, use your browser's developer tools or click "Clear All" in the history sidebar.

## Inspired By

This extension is inspired by the [strapi-plugin-raw-query](https://github.com/creazy231/strapi-plugin-raw-query) for Strapi CMS.

## Contributing

Feel free to submit issues or pull requests to improve this extension!

