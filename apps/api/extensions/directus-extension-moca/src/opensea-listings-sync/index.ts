import { defineHook } from "@directus/extensions-sdk";
import axios from "axios";
import type { OpenSeaListing, OpenSeaListingsResponse } from "./types";

export default defineHook(({ schedule }, { env, services, getSchema }) => {
  schedule("* * * * *", async () => {
    try {
      console.log("[OpenSea Listings Sync] Fetching listings...");

      const TARGET_COUNT = 10;
      const uniqueListings = new Map<string, OpenSeaListing>();
      let cursor: string | undefined;
      let totalFetched = 0;
      const maxAttempts = 5; // Prevent infinite loops
      let attempts = 0;

      // Fetch listings until we have 10 unique token IDs
      while (uniqueListings.size < TARGET_COUNT && attempts < maxAttempts) {
        attempts++;

        const url = new URL(
          "https://api.opensea.io/api/v2/listings/collection/art-decc0s/best",
        );
        url.searchParams.set("include_private_listings", "false");
        url.searchParams.set("limit", "10");
        if (cursor) {
          url.searchParams.set("next", cursor);
        }

        const { data } = await axios.get<OpenSeaListingsResponse>(
          url.toString(),
          {
            headers: {
              "X-API-KEY": env.OPENSEA_API_KEY,
            },
          },
        );

        totalFetched += data.listings.length;
        console.log(
          `[OpenSea Listings Sync] Attempt ${attempts}: Found ${data.listings.length} listings (total fetched: ${totalFetched})`,
        );

        // Add unique listings to our map
        for (const listing of data.listings) {
          const tokenId = listing.protocol_data.parameters.offer[0]?.identifierOrCriteria;
          if (tokenId && !uniqueListings.has(tokenId)) {
            uniqueListings.set(tokenId, listing);
            console.log(
              `[OpenSea Listings Sync] Added unique token ID: ${tokenId} (${uniqueListings.size}/${TARGET_COUNT})`,
            );
          } else if (tokenId) {
            console.log(
              `[OpenSea Listings Sync] Skipped duplicate token ID: ${tokenId}`,
            );
          }
        }

        // If we have enough unique listings or no more pages, stop
        if (uniqueListings.size >= TARGET_COUNT || !data.next) {
          break;
        }

        cursor = data.next;
      }

      const listings = Array.from(uniqueListings.values());
      console.log(
        `[OpenSea Listings Sync] Collected ${uniqueListings.size} unique listings after ${attempts} attempt(s)`,
      );

      // Extract token IDs from unique listings
      const tokenIds = listings
        .map(listing => listing.protocol_data.parameters.offer[0]?.identifierOrCriteria)
        .filter(id => id !== undefined)
        .join(",");

      console.log(`[OpenSea Listings Sync] Token IDs: ${tokenIds}`);

      // Update or create settings record
      const schema = await getSchema();
      const { ItemsService } = services;
      const settingsService = new ItemsService("settings", { schema });

      // Check if 'adoption' setting exists
      const existingSettings = await settingsService.readByQuery({
        filter: { key: { _eq: "adoption" } },
        limit: 1,
      });

      if (existingSettings.length > 0 && existingSettings[0]) {
        // Update existing record
        await settingsService.updateOne(existingSettings[0].key, {
          value: tokenIds,
        });
        console.log("[OpenSea Listings Sync] Updated 'adoption' setting");
      } else {
        // Create new record
        await settingsService.createOne({
          key: "adoption",
          value: tokenIds,
        });
        console.log("[OpenSea Listings Sync] Created 'adoption' setting");
      }

      listings.forEach((listing) => {
        console.log(`[OpenSea Listings Sync] Token ID: ${listing.protocol_data.parameters.offer[0]?.identifierOrCriteria}`);
      });
    } catch (error) {
      console.error("[OpenSea Listings Sync] Error fetching listings:", error);
    }
  });
});
