import { defineHook } from "@directus/extensions-sdk";
import axios from "axios";
import type { OpenSeaListingsResponse } from "./types";

export default defineHook(({ schedule }, { env, services, getSchema }) => {
  schedule("* * * * *", async () => {
    try {
      console.log("[OpenSea Listings Sync] Fetching listings...");

      const { data } = await axios.get<OpenSeaListingsResponse>(
        "https://api.opensea.io/api/v2/listings/collection/art-decc0s/best?include_private_listings=false&limit=10",
        {
          headers: {
            "X-API-KEY": env.OPENSEA_API_KEY,
          },
        },
      );

      console.log(
        `[OpenSea Listings Sync] Found ${data.listings.length} listings`,
      );

      // Extract token IDs from listings
      const tokenIds = data.listings
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

      data.listings.forEach((listing) => {
        console.log(`[OpenSea Listings Sync] Token ID: ${listing.protocol_data.parameters.offer[0]?.identifierOrCriteria}`);
      });
    } catch (error) {
      console.error("[OpenSea Listings Sync] Error fetching listings:", error);
    }
  });
});
