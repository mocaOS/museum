import { createReadStream } from "node:fs";
import { join } from "node:path";
import csvParser from "csv-parser";
import { createDirectus, createItem, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import type { Contracts, CustomDirectusTypes } from "@local/types/directus";
import dotenv from "dotenv";
import type { CsvRow } from "./types";

dotenv.config();

// Configuration
const CSV_FILE_PATH = join(import.meta.dir, process.env.CSV_FILE_PATH as string);
const DIRECTUS_URL = process.env.DIRECTUS_URL as string;
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN as string;

// Initialize Directus client
const client = createDirectus<CustomDirectusTypes>(DIRECTUS_URL)
  .with(staticToken(DIRECTUS_TOKEN))
  .with(rest());

// Stats for reporting
const stats = {
  totalProcessed: 0,
  activeItems: 0,
  contractsFound: 0,
  contractsCreated: 0,
  nftsFound: 0,
  nftsCreated: 0,
  collectionsFound: 0,
  collectionsCreated: 0,
  contractsCreatedList: new Set<string>(),
  nftsCreatedList: new Set<string>(),
  collectionsCreatedList: new Set<string>(),
};

async function main() {
  console.log("Starting CSV import process...");

  // Read and parse CSV file
  const rows: CsvRow[] = [];

  await new Promise<void>((resolve, reject) => {
    createReadStream(CSV_FILE_PATH)
      .pipe(csvParser())
      .on("data", (row: CsvRow) => {
        rows.push(row);
        stats.totalProcessed++;
      })
      .on("end", () => {
        console.log(`CSV file successfully processed. Found ${rows.length} rows.`);
        resolve();
      })
      .on("error", (error: Error) => {
        console.error("Error reading CSV file:", error);
        reject(error);
      });
  });

  // Filter active items
  const activeItems = rows;
  stats.activeItems = activeItems.length;

  console.log(`Found ${activeItems.length} active items to process.`);

  // Process each active item
  for (const item of activeItems) {
    if (item.Chain === "polygon") item.Chain = "matic";

    const contractAddress = item["Smart Contract Hash"].toLowerCase();
    const tokenId = item.TokenID;
    const collectionName = item.Collection;

    console.log(`Processing item: ${item["Smart Contract Hash"]} (${contractAddress}:${tokenId})`);

    // Check if contract exists
    const directusContracts = await client.request(readItems("contracts", {
      filter: {
        address: {
          _eq: contractAddress,
        },
      },
    }));

    // Create contract if it doesn't exist or get existing one
    let directusContract: Contracts;

    if (!directusContracts.length) {
      console.log(`Contract ${contractAddress} is not in Directus Database. Creating...`);

      directusContract = await client.request(createItem("contracts", {
        address: contractAddress,
        chain: item.Chain || "ethereum",
        nfts: [],
      })) as unknown as Contracts;

      console.log(`Contract ${contractAddress} created in Directus Database`);
      stats.contractsCreated++;
      stats.contractsCreatedList.add(contractAddress);

      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      directusContract = directusContracts[0] as Contracts;
      stats.contractsFound++;
    }

    // Check if collection exists
    const directusCollections = await client.request(readItems("collections", {
      filter: {
        name: {
          _eq: collectionName,
        },
      },
    }));

    // Create collection if it doesn't exist or get existing one
    let directusCollection;

    if (!directusCollections.length) {
      console.log(`Collection ${collectionName} is not in Directus Database. Creating...`);

      directusCollection = await client.request(createItem("collections", {
        name: collectionName,
      }));

      console.log(`Collection ${collectionName} created in Directus Database`);
      stats.collectionsCreated++;
      stats.collectionsCreatedList.add(collectionName);

      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      directusCollection = directusCollections[0];
      stats.collectionsFound++;
    }

    // Check if NFT exists
    const directusNFTs = await client.request(readItems("nfts", {
      filter: {
        contract: {
          address: {
            _eq: contractAddress,
          },
        },
        identifier: {
          _eq: tokenId,
        },
      },
      fields: [ "id", "collection_type", "artist_name" ],
    }));

    // Create NFT if it doesn't exist
    if (!directusNFTs.length) {
      console.log(`NFT ${tokenId} of ${contractAddress} is not in Directus Database. Creating...`);

      await client.request(createItem("nfts", {
        collection_type: directusCollection?.id || null,
        artist_name: item.Artist,
        contract: directusContract,
        identifier: tokenId,
      })).catch((error) => {
        console.error("Error creating NFT:", error);
      });

      console.log(`NFT ${tokenId} of ${contractAddress} created in Directus Database`);
      stats.nftsCreated++;
      stats.nftsCreatedList.add(`${contractAddress}:${tokenId}`);

      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      console.log(`NFT ${tokenId} of ${contractAddress} is already in Directus Database.`);

      // Check if collection_type or artist_name needs to be updated
      const updateFields: Record<string, any> = {};
      let needsUpdate = false;

      const existingNFT = directusNFTs[0];

      if (existingNFT && directusCollection?.id && existingNFT.collection_type !== directusCollection.id) {
        updateFields.collection_type = directusCollection.id;
        needsUpdate = true;
        console.log(`NFT ${tokenId} of ${contractAddress} needs collection_type update from ${existingNFT.collection_type || "null"} to ${directusCollection.id}`);
      }

      if (existingNFT && item.Artist && existingNFT.artist_name !== item.Artist) {
        updateFields.artist_name = item.Artist;
        needsUpdate = true;
        console.log(`NFT ${tokenId} of ${contractAddress} needs artist_name update from "${existingNFT.artist_name || "null"}" to "${item.Artist}"`);
      }

      if (needsUpdate && existingNFT) {
        console.log(`Updating NFT ${tokenId} of ${contractAddress}`);

        await client.request(
          updateItem("nfts", existingNFT.id, updateFields),
        ).catch((error) => {
          console.error("Error updating NFT:", error);
        });

        console.log(`NFT ${tokenId} of ${contractAddress} updated successfully`);
      }

      stats.nftsFound++;
    }
  }

  // Log statistics
  console.log("\n--- Import Statistics ---");
  console.log(`Total rows processed: ${stats.totalProcessed}`);
  console.log(`Active items found: ${stats.activeItems}`);
  console.log(`Contracts found in database: ${stats.contractsFound}`);
  console.log(`Contracts created: ${stats.contractsCreated}`);
  console.log(`Collections found in database: ${stats.collectionsFound}`);
  console.log(`Collections created: ${stats.collectionsCreated}`);
  console.log(`NFTs found in database: ${stats.nftsFound}`);
  console.log(`NFTs created: ${stats.nftsCreated}`);

  if (stats.contractsCreated > 0) {
    console.log("\nContracts created:");
    Array.from(stats.contractsCreatedList).forEach(address => console.log(`- ${address}`));
  }

  if (stats.collectionsCreated > 0) {
    console.log("\nCollections created:");
    Array.from(stats.collectionsCreatedList).forEach(name => console.log(`- ${name}`));
  }

  if (stats.nftsCreated > 0) {
    console.log("\nNFTs created (contract:tokenId):");
    Array.from(stats.nftsCreatedList).forEach(nft => console.log(`- ${nft}`));
  }
}

main().catch((error) => {
  console.error("Error in import process:", error);
  process.exitCode = 1;
});
