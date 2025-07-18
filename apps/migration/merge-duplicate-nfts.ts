import { createDirectus, deleteItem, readItems, rest, staticToken } from "@directus/sdk";
import dotenv from "dotenv";
import { CustomDirectusTypes, Nfts } from "./types";

dotenv.config();

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

interface NFTGroup {
  withArtistName: Nfts[];
  withoutArtistName: Nfts[];
}

interface OpenSeaResponse {
  identifier: string;
  contract: string;
}

async function main() {
  console.log("Starting duplicate NFT detection and merge process...");

  // Get all NFTs with OpenSea response
  const nfts = await client.request(readItems("nfts", {
    fields: [ "*" ],
    filter: {
      response_opensea: { _nnull: true },
    },
    limit: -1,
  })) as Nfts[];

  console.log(`Found ${nfts.length} NFTs with OpenSea response`);

  // Group NFTs by OpenSea identifier and contract
  const nftGroups = nfts.reduce<Record<string, NFTGroup>>((acc, nft) => {
    const response = nft.response_opensea as OpenSeaResponse | null;
    if (!response?.identifier || !response?.contract) {
      return acc;
    }

    const key = `${response.identifier.toLowerCase()}_${response.contract.toLowerCase()}`;

    if (!acc[key]) {
      acc[key] = {
        withArtistName: [],
        withoutArtistName: [],
      };
    }

    if (nft.name) { // Using name instead of artist_name as per the type definition
      acc[key].withArtistName.push(nft);
    } else {
      acc[key].withoutArtistName.push(nft);
    }

    return acc;
  }, {});

  // Find groups with duplicates
  const duplicateGroups = Object.entries(nftGroups).filter(([ _, group ]) =>
    (group.withArtistName.length + group.withoutArtistName.length) > 1,
  );

  console.log(`Found ${duplicateGroups.length} groups with duplicate NFTs`);

  // Process each group of duplicates
  for (const [ key, group ] of duplicateGroups) {
    console.log(`\nProcessing duplicates for key: ${key}`);
    console.log(`Found ${group.withArtistName.length} NFTs with name and ${group.withoutArtistName.length} without`);

    // Skip if no NFTs with name
    if (group.withArtistName.length === 0) {
      console.log("No NFTs with name found in this group, skipping...");
      continue;
    }

    // Keep the first NFT with name
    const nftToKeep = group.withArtistName[0];
    const nftsToDelete = [
      ...group.withArtistName.slice(1),
      ...group.withoutArtistName,
    ];

    console.log(`Keeping NFT ${nftToKeep.id} with name: ${nftToKeep.name}`);

    // Delete duplicate NFTs
    for (const nft of nftsToDelete) {
      try {
        await client.request(deleteItem("nfts", nft.id));
        console.log(`Deleted duplicate NFT ${nft.id}`);
      } catch (error: any) {
        if (error?.errors?.[0]?.extensions?.code === "FORBIDDEN") {
          console.error(`Permission denied when deleting NFT ${nft.id}. Please check Directus permissions.`);
        } else {
          console.error(`Failed to delete NFT ${nft.id}:`, error);
        }
      }

      // Add a small delay between deletions
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log("\nMerge process completed!");
}

main().catch((error) => {
  console.error("Error during merge process:", error);
  process.exitCode = 1;
});
