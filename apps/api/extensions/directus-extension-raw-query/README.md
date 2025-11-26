<p align="center">
  <img src="https://github.com/creazy231/directus-extension-raw-query/blob/main/logo-transparent-cropped.png?raw=true" alt="Directus Raw Query Extension Logo" width="200">
</p>

<h1 align="center">
Directus Extension: Raw Query
</h1>

<p align="center"><img src="https://img.shields.io/github/package-json/v/creazy231/directus-extension-raw-query" alt="GitHub package.json version">&nbsp;<a href="https://github.com/creazy231/directus-extension-raw-query/releases"><img src="https://img.shields.io/github/v/release/creazy231/directus-extension-raw-query" alt="GitHub Release"></a></p>

<p align="center"><a href="https://www.npmjs.org/package/directus-extension-raw-query"><img src="https://img.shields.io/npm/v/directus-extension-raw-query?logo=npm&logoColor=%23FFFFFF&label=NPM" alt="NPM Version"></a>&nbsp;<a href="https://www.npmjs.org/package/directus-extension-raw-query"><img src="https://img.shields.io/npm/dm/directus-extension-raw-query?logo=npm&logoColor=%23FFFFFF&label=Downloads" alt="NPM Downloads"></a>&nbsp;<a href="https://github.com/creazy231/directus-extension-raw-query/graphs/commit-activity"><img src="https://img.shields.io/badge/Maintained%3F-yes-green.svg" alt="Maintenance"></a></p>

<p align="center"><a href="https://github.com/creazy231/directus-extension-raw-query/stargazers/"><img src="https://img.shields.io/github/stars/creazy231/directus-extension-raw-query?style=social&label=Stars" alt="GitHub Stars"></a>&nbsp;<a href="https://github.com/creazy231/directus-extension-raw-query/network/"><img src="https://img.shields.io/github/forks/creazy231/directus-extension-raw-query?style=social&label=Forks" alt="GitHub Forks"></a>&nbsp;<a href="https://ko-fi.com/creazy231"><img src="https://img.shields.io/badge/Ko--fi-Support%20me%20on%20Ko--fi-FF5E5B?logo=ko-fi&logoColor=white" alt="Support me on Ko-fi"></a></p>

<hr>

## ✨ Features

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

## ⏳ Installation

Install the extension via npm:

```bash
npm install directus-extension-raw-query@latest

# or

yarn add directus-extension-raw-query@latest
```

Or using Directus CLI:

```bash
npx directus-extension install directus-extension-raw-query
```

After installation, restart your Directus instance. The extension will be automatically loaded and available in the admin panel.

## 🖐 Requirements

**Supported Directus versions**:
- Directus: >= 10.10.0

**Supported Node versions**:
- Node: >= 18.x.x
- npm: >= 8.0.0

_We recommend always using the latest version of Directus to start your new projects_.

## 📖 Usage

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

## 🔒 Security

- **Admin-Only**: The extension performs multiple security checks:
  1. User must be authenticated
  2. User must have admin privileges (`req.accountability.admin`)
  3. Module pre-registration check prevents non-admins from seeing it
- **Data Storage**: Query history and drafts are stored in browser localStorage
- **No Password Exposure**: Query results don't expose sensitive fields

## 🔌 API Endpoints

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

## 💻 Development

Build the extension:
```bash
bun run build
```

Watch mode for development:
```bash
bun run dev
```

## 🏗️ Architecture

- **Type**: Bundle Extension (contains both endpoint and module)
- **Endpoints**:
  - `/raw-query/execute` (POST) - Handles query execution
  - `/raw-query/schema` (GET) - Fetches database schema for autocomplete
- **Module**: Admin UI with Monaco Editor
- **Technologies**: TypeScript, Vue 3, Monaco Editor
- **Storage**: LocalStorage for query history (last 50) and draft auto-save
- **UI Components**: Uses Directus's built-in UI library for consistent design
- **Autocomplete**: Dynamic SQL completions based on actual database structure

## 📝 Example Queries

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

## 🔧 Troubleshooting

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

## 💾 LocalStorage Keys

The extension uses the following localStorage keys:
- `directus_raw_query_history`: Stores the last 50 executed queries
- `directus_raw_query_draft`: Stores the current editor content for auto-restore

To clear all stored data, use your browser's developer tools or click "Clear All" in the history sidebar.

## 🤝 Contributing

Feel free to fork and make a Pull Request to this extension project. All the input is warmly welcome!

## ⭐️ Show your support

Give a star if this project helped you.

## 🔗 Links

- [NPM package](https://www.npmjs.com/package/directus-extension-raw-query)
- [GitHub repository](https://github.com/creazy231/directus-extension-raw-query)

## 📄 License

MIT License Copyright 2025 creazy231

## 🙏 Inspired By

This extension is inspired by the [strapi-plugin-raw-query](https://github.com/creazy231/strapi-plugin-raw-query) for Strapi CMS.

[![ForTheBadge built-with-love](http://ForTheBadge.com/images/badges/built-with-love.svg)](https://github.com/creazy231/)
