import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { CustomDirectusTypes } from "./types";

dotenv.config();

(async () => {
  // Connect to Directus
  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  // Fetch all NFTs that have a collection_type
  const nfts = await client.request(readItems("nfts", {
    filter: {
      collection_type: {
        _nnull: true,
      },
    },
    fields: [ "id", "collection_type" ],
    limit: -1, // Get all matching items
  }));

  console.log(`Found ${nfts.length} NFTs with collection_type set`);

  if (nfts.length === 0) {
    console.log("No NFTs need to be updated. Exiting...");
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  try {
    // Update NFTs one by one
    for (const nft of nfts) {
      try {
        await client.request(updateItem("nfts", nft.id, {
          collection_type: null,
        }));
        successCount++;

        // Log progress every 10 items
        if (successCount % 10 === 0) {
          console.log(`Progress: ${successCount}/${nfts.length} NFTs updated`);
        }
      } catch (error) {
        console.error(`Failed to update NFT ${nft.id}:`, error);
        failureCount++;
      }
    }

    console.log("\nUpdate complete!");
    console.log(`Successfully updated: ${successCount} NFTs`);
    console.log(`Failed to update: ${failureCount} NFTs`);
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  }
})();
