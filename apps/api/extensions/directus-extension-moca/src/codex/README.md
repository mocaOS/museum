# Codex API Endpoint

This endpoint provides access to codex files for DeCC0 NFT tokens.

## Endpoint

```
GET /codex/:token_id
```

## Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token_id` | integer | Yes | The token ID (e.g., 1, 143, 1337) |

## Response Format

### Success Response (200 OK)

When a codex file is found and successfully read:

```json
{
  "success": true,
  "token_id": 143,
  "data": {
    // Complete contents of the codex JSON file
  }
}
```

**Fields:**
- `success` (boolean): Always `true` for successful requests
- `token_id` (integer): The numeric token ID that was requested
- `data` (object): The complete contents of the codex JSON file

### Error Responses

#### 400 Bad Request - Invalid Token ID

When the token ID parameter is not a valid number:

```json
{
  "success": false,
  "error": "Invalid token ID. Must be a number."
}
```

**Example triggers:**
- `/codex/abc` - non-numeric value
- `/codex/12.5` - decimal number
- `/codex/` - missing token ID

#### 404 Not Found - Codex File Not Found

When no codex file exists for the given token ID:

```json
{
  "success": false,
  "error": "Codex file not found for token ID: 143",
  "filename": "Art_DeCC0_00143.codex.json"
}
```

**Fields:**
- `success` (boolean): Always `false` for errors
- `error` (string): Human-readable error message
- `filename` (string): The expected filename that was not found

**Example triggers:**
- Token ID that doesn't exist (e.g., `/codex/99999`)
- Token ID outside the valid range

#### 500 Internal Server Error

When an unexpected error occurs while reading or parsing the file:

```json
{
  "success": false,
  "error": "Internal server error while reading codex file",
  "message": "Detailed error message here"
}
```

**Fields:**
- `success` (boolean): Always `false` for errors
- `error` (string): Generic error message
- `message` (string): Specific error details (may vary)

**Example triggers:**
- File system permission errors
- Corrupted JSON file
- File system unavailable

## Usage Examples

### Example 1: Successful Request

**Request:**
```bash
GET /codex/1
```

**Response:** `200 OK`
```json
{
  "success": true,
  "token_id": 1,
  "data": {
    // Complete codex JSON data for token #1
  }
}
```

### Example 2: Token Not Found

**Request:**
```bash
GET /codex/99999
```

**Response:** `404 Not Found`
```json
{
  "success": false,
  "error": "Codex file not found for token ID: 99999",
  "filename": "Art_DeCC0_99999.codex.json"
}
```

### Example 3: Invalid Token ID

**Request:**
```bash
GET /codex/invalid
```

**Response:** `400 Bad Request`
```json
{
  "success": false,
  "error": "Invalid token ID. Must be a number."
}
```

## File Naming Convention

The endpoint automatically converts token IDs to the standardized filename format:

| Token ID | Filename |
|----------|----------|
| 1 | `Art_DeCC0_00001.codex.json` |
| 143 | `Art_DeCC0_00143.codex.json` |
| 1337 | `Art_DeCC0_01337.codex.json` |
| 12345 | `Art_DeCC0_12345.codex.json` |

Token IDs are zero-padded to 5 digits in the filename.

## File Location

Codex files are located at:
```
apps/moca-agent/codex/Art_DeCC0_[TOKEN_ID].codex.json
```

## Integration Notes

### Error Handling

Always check the `success` field in the response:

```javascript
const response = await fetch('/codex/143');
const result = await response.json();

if (result.success) {
  // Handle successful response
  console.log('Token ID:', result.token_id);
  console.log('Codex Data:', result.data);
} else {
  // Handle error
  console.error('Error:', result.error);
}
```

### HTTP Status Codes

- `200`: Success - codex file found and returned
- `400`: Client error - invalid token ID format
- `404`: Not found - codex file doesn't exist
- `500`: Server error - unexpected error occurred