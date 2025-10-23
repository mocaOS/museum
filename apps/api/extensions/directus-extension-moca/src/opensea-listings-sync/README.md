# OpenSea Listings Sync

This hook implements a cron job that runs every minute to fetch the best listings for the art-decc0s collection from OpenSea.

## Configuration

The hook requires the following environment variable:
- `OPENSEA_API_KEY` - Your OpenSea API key

## Functionality

- **Schedule**: Runs every minute (`* * * * *`)
- **Endpoint**: `https://api.opensea.io/api/v2/listings/collection/art-decc0s/best?include_private_listings=false&limit=10`
- **Actions**: 
  1. Fetches the top 10 public listings from OpenSea
  2. Extracts token IDs from the listings
  3. Stores token IDs in the Directus `settings` table with key `adoption`
  4. Logs listing details to the console

## Database Integration

The cron job automatically manages a `settings` record:
- **Key**: `adoption`
- **Value**: Comma-separated token IDs (e.g., `7521,7988,4997`)
- **Behavior**: 
  - Creates the record if it doesn't exist
  - Updates the existing record every minute with the latest token IDs

## Type Definitions

The hook includes comprehensive TypeScript types for the OpenSea API response:

- `OpenSeaListingsResponse` - Root response object
- `OpenSeaListing` - Individual listing details
- `ProtocolData` - Seaport protocol data
- `ProtocolParameters` - Order parameters
- `OfferItem` - Items being offered
- `ConsiderationItem` - Consideration (payment) items
- `Price` - Current price information

See `types.ts` for complete type definitions.

## Console Output

The cron job logs:
- Number of listings found
- Comma-separated token IDs extracted
- Database operation result (created or updated)
- Token ID, price, and order hash for each listing
- Next page token (if available)

Example output:
```
[OpenSea Listings Sync] Fetching listings...
[OpenSea Listings Sync] Found 10 listings
[OpenSea Listings Sync] Token IDs: 7521,7988,4997,4997,5518,8796,8796,9686,9574,4422
[OpenSea Listings Sync] Updated 'adoption' setting
[OpenSea Listings Sync] Token ID: 7521, Price: 13600000000000000 ETH, Order Hash: 0x90fcd04...
...
```

## Future Enhancements

Potential future improvements:
- Store complete listing data in a dedicated Directus collection
- Compare with previous listings to detect changes
- Send notifications when new listings appear
- Track price changes over time
- Implement pagination using the `next` token
- Store additional metadata (prices, order hashes, timestamps)
- Add configurable collection slug via settings

