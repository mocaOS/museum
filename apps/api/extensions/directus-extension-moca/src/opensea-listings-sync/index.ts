import { defineHook } from "@directus/extensions-sdk";
import type { OpenSeaListing, OpenSeaListingsResponse } from "@local/types/opensea";

export default defineHook(({ schedule }, { env, services, getSchema }) => {
  // Coolify API configuration
  const COOLIFY_BASE_URL = "https://deploy.qwellco.de";
  const COOLIFY_API = `${COOLIFY_BASE_URL}/api/v1`;
  const COOLIFY_TOKEN = env.COOLIFY_TOKEN;

  async function httpJson(method: string, url: string, body?: Record<string, unknown> | string) {
    const headers: Record<string, string> = { Authorization: `Bearer ${COOLIFY_TOKEN}` };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(url, { method, headers, body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${url} -> ${response.status} ${response.statusText}: ${text}`);
    }
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text as unknown;
    }
  }

  // Schedule to restart Coolify application every hour at minute 55
  schedule("55 * * * *", async () => {
    try {
      const applicationUuid = env.APP_ENV === "production" ? "d4wkgogsw0gscosg8o0c4k8s" : "ack4woskwo84ccokc4gc80ww";
      console.log(`[Coolify Restart] Restarting application ${applicationUuid}...`);

      const restartUrl = `${COOLIFY_API}/applications/${applicationUuid}/restart`;
      await httpJson("GET", restartUrl);

      console.log(`[Coolify Restart] ✓ Successfully restarted application ${applicationUuid}`);
    } catch (error) {
      console.error("[Coolify Restart] Error restarting application:", error);
    }
  });

  schedule("* * * * *", async () => {
    try {
      const TARGET_COUNT = 10;
      const MAX_ATTEMPTS = 5;
      const uniqueListings = new Map<string, OpenSeaListing>();
      const allListings: OpenSeaListing[] = [];
      let cursor: string | undefined;
      let attempts = 0;

      // Fetch listings until we have 10 unique token IDs or reach max attempts
      while (uniqueListings.size < TARGET_COUNT && attempts < MAX_ATTEMPTS) {
        attempts++;

        try {
          const url = new URL(
            "https://api.opensea.io/api/v2/listings/collection/art-decc0s/best",
          );
          url.searchParams.set("include_private_listings", "false");
          url.searchParams.set("limit", "200");
          if (cursor) {
            url.searchParams.set("next", cursor);
          }

          const response = await fetch(url.toString(), {
            headers: {
              "X-API-KEY": env.OPENSEA_API_KEY,
            },
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(`GET ${url.toString()} -> ${response.status} ${response.statusText}: ${text}`);
          }

          const data = await response.json() as OpenSeaListingsResponse;

          // Add all listings to the array
          allListings.push(...data.listings);

          // Add unique listings to our map
          for (const listing of data.listings) {
            const tokenId = listing.protocol_data.parameters.offer[0]?.identifierOrCriteria;
            if (tokenId && !uniqueListings.has(tokenId)) {
              uniqueListings.set(tokenId, listing);
            }
          }

          // If we have enough unique listings or no more pages, stop
          if (uniqueListings.size >= TARGET_COUNT || !data.next) {
            break;
          }

          cursor = data.next;
        } catch (error) {
          console.error(
            `[OpenSea Listings Sync] ⚠️  Attempt ${attempts} failed:`,
            error instanceof Error ? error.message : error,
          );
          // Continue to next attempt
        }

        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      const listings = Array.from(uniqueListings.values()).slice(0, 10);

      // Check if we have any listings to process
      if (listings.length === 0) {
        console.error("[OpenSea Listings Sync] No unique listings found. Skipping update.");
        return;
      }

      // Extract token IDs from unique listings
      const tokenIds = listings
        .map(listing => listing.protocol_data.parameters.offer[0]?.identifierOrCriteria)
        .filter(id => id !== undefined)
        .join(",");

      console.log(`[OpenSea Listings Sync] Token IDs: ${tokenIds}`);
      console.log(`[OpenSea Listings Sync] Total listings fetched: ${allListings.length}`);

      // Prepare adoption details with all listings (tokenId and price)
      const adoptionDetails = allListings.map(listing => ({
        tokenId: listing.protocol_data.parameters.offer[0]?.identifierOrCriteria,
        price: {
          value: listing.price.current.value,
          currency: listing.price.current.currency,
          decimals: listing.price.current.decimals,
        },
      }));

      // Update or create settings record
      const schema = await getSchema();
      const { ItemsService } = services;
      const settingsService = new ItemsService("settings", { schema });

      // Check if 'adoption' setting exists
      const existingAdoptionSettings = await settingsService.readByQuery({
        filter: { key: { _eq: "adoption" } },
        limit: 1,
      });

      if (existingAdoptionSettings.length > 0 && existingAdoptionSettings[0]) {
        // Update existing record
        await settingsService.updateOne(existingAdoptionSettings[0].key, {
          value: tokenIds,
        });
      } else {
        // Create new record
        await settingsService.createOne({
          key: "adoption",
          value: tokenIds,
        });
      }

      // Check if 'adoption_details' setting exists
      const existingAdoptionDetailsSettings = await settingsService.readByQuery({
        filter: { key: { _eq: "adoption_details" } },
        limit: 1,
      });

      if (existingAdoptionDetailsSettings.length > 0 && existingAdoptionDetailsSettings[0]) {
        // Update existing record
        await settingsService.updateOne(existingAdoptionDetailsSettings[0].key, {
          value: JSON.stringify(adoptionDetails),
        });
      } else {
        // Create new record
        await settingsService.createOne({
          key: "adoption_details",
          value: JSON.stringify(adoptionDetails),
        });
      }
    } catch (error) {
      console.error("[OpenSea Listings Sync] Error fetching listings:", error);
    }
  });
});
