# Listings Endpoint

This endpoint provides access to the OpenSea listing details stored by the `opensea-listings-sync` hook.

## Endpoint

```
GET /listings
```

## Description

Fetches the `adoption_details` setting from the Directus settings table, which contains an array of NFT listings with their token IDs and current prices from OpenSea.

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "data": [
    {
      "tokenId": "1234",
      "price": {
        "value": "50000000000000000",
        "currency": "ETH",
        "decimals": 18
      }
    },
    {
      "tokenId": "5678",
      "price": {
        "value": "75000000000000000",
        "currency": "ETH",
        "decimals": 18
      }
    }
  ],
  "count": 2
}
```

### Error Responses

**404 Not Found** - When listings data doesn't exist yet:
```json
{
  "error": "Adoption details not found",
  "message": "The adoption_details setting does not exist yet. The sync job may not have run."
}
```

**500 Internal Server Error** - When the stored value is not valid JSON:
```json
{
  "error": "Invalid JSON format",
  "message": "The adoption_details value is not valid JSON",
  "raw": "invalid json string"
}
```

**500 Internal Server Error** - General error:
```json
{
  "error": "Internal server error",
  "message": "Error message details"
}
```

## Data Structure

Each listing object in the `data` array contains:

- `tokenId` (string): The NFT token identifier
- `price` (object):
  - `value` (string): The price value in the smallest unit (wei for ETH)
  - `currency` (string): The currency symbol (e.g., "ETH")
  - `decimals` (number): Number of decimal places for the currency

## Usage Example

```bash
# The endpoint is available at /listings
curl https://your-directus-instance.com/listings
```

```javascript
// Fetch listings
const response = await fetch('/listings');
const { success, data, count } = await response.json();

if (success) {
  console.log(`Found ${count} listings`);
  
  // Convert price from wei to ETH
  data.forEach(listing => {
    const priceInEth = Number(listing.price.value) / Math.pow(10, listing.price.decimals);
    console.log(`Token ${listing.tokenId}: ${priceInEth} ${listing.price.currency}`);
  });
}
```

**Vue/Nuxt Example:**

```vue
<script setup lang="ts">
interface Listing {
  tokenId: string;
  price: {
    value: string;
    currency: string;
    decimals: number;
  };
}

const { data: listingsData } = await useFetch('/listings');

const formatPrice = (listing: Listing) => {
  const priceInEth = Number(listing.price.value) / Math.pow(10, listing.price.decimals);
  return `${priceInEth.toFixed(4)} ${listing.price.currency}`;
};
</script>

<template>
  <div v-if="listingsData?.success">
    <h2>Available NFTs ({{ listingsData.count }})</h2>
    <div v-for="listing in listingsData.data" :key="listing.tokenId">
      <p>Token #{{ listing.tokenId }}: {{ formatPrice(listing) }}</p>
    </div>
  </div>
</template>
```

## How It Works

The `opensea-listings-sync` hook runs every minute and:
1. Fetches the top 10 unique NFT listings from OpenSea's "art-decc0s" collection
2. Stores the tokenIds in the `adoption` setting (comma-separated string)
3. Stores the full listing details (tokenIds + prices) in the `adoption_details` setting (JSON array)

This endpoint reads the `adoption_details` setting and returns the parsed listing data.

## Notes

- This endpoint is read-only (GET only)
- Data is updated every minute by the `opensea-listings-sync` cron job
- The endpoint requires no authentication (public access)
- Price values are returned as strings to maintain precision for large numbers
- The endpoint returns up to 10 listings at a time (as configured in the sync hook)

