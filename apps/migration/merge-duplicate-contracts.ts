import { createDirectus, deleteItem, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

async function main() {
  console.log("Starting duplicate contract detection and merge process...");

  // Get all contracts
  const contracts = await client.request(readItems("contracts", {
    fields: [ "*", { nfts: [ "id", "identifier" ] } ],
    limit: -1,
  })) as Contracts[];

  // Group contracts by address
  const contractsByAddress = contracts.reduce<{ [key: string]: Contracts[] }>((acc, contract) => {
    const address = contract.address.toLowerCase();
    if (!acc[address]) {
      acc[address] = [];
    }
    acc[address].push(contract);
    return acc;
  }, {});

  // Find addresses with multiple contracts
  const duplicateAddresses = Object.entries(contractsByAddress)
    .filter(([ _, contracts ]) => contracts.length > 1);

  console.log(`Found ${duplicateAddresses.length} addresses with duplicate contracts`);

  // Process each set of duplicate contracts
  for (const [ address, duplicateContracts ] of duplicateAddresses) {
    console.log(`\nProcessing duplicates for address: ${address}`);
    console.log(`Found ${duplicateContracts.length} duplicate contracts`);

    // Sort contracts by number of NFTs (descending) and creation date
    const sortedContracts = duplicateContracts.sort((a, b) => {
      const aNfts = Array.isArray(a.nfts) ? a.nfts.length : 0;
      const bNfts = Array.isArray(b.nfts) ? b.nfts.length : 0;
      if (aNfts !== bNfts) return bNfts - aNfts;
      return (a.date_created || "") > (b.date_created || "") ? -1 : 1;
    });

    // Keep the first contract (with most NFTs/newest) and merge others into it
    const primaryContract = sortedContracts[0];
    const contractsToMerge = sortedContracts.slice(1);

    console.log(`Keeping contract ${primaryContract.address} (${Array.isArray(primaryContract.nfts) ? primaryContract.nfts.length : 0} NFTs)`);

    // Update NFTs from other contracts to point to the primary contract
    for (const contract of contractsToMerge) {
      if (Array.isArray(contract.nfts) && contract.nfts.length > 0) {
        console.log(`Migrating ${contract.nfts.length} NFTs from contract ${contract.address}`);

        for (const nft of contract.nfts) {
          if (!nft || typeof nft === "string" || !nft.id) {
            console.log(`Skipping invalid NFT entry in contract ${contract.address}`);
            continue;
          }

          try {
            await client.request(updateItem("nfts", nft.id, {
              contract: primaryContract.address,
            }));
            console.log(`Updated NFT ${nft.id} (identifier: ${nft.identifier}) to point to primary contract`);
          } catch (error: any) {
            if (error?.errors?.[0]?.extensions?.code === "FORBIDDEN") {
              console.error(`Permission denied when updating NFT ${nft.id}. Please check Directus permissions.`);
            } else {
              console.error(`Failed to update NFT ${nft.id}:`, error);
            }
          }

          // Add a small delay between updates to avoid overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Delete the duplicate contract
      try {
        await client.request(deleteItem("contracts", contract.address));
        console.log(`Deleted duplicate contract ${contract.address}`);
      } catch (error: any) {
        if (error?.errors?.[0]?.extensions?.code === "FORBIDDEN") {
          console.error(`Permission denied when deleting contract ${contract.address}. Please check Directus permissions.`);
        } else {
          console.error(`Failed to delete contract ${contract.address}:`, error);
        }
      }

      // Add a small delay between contract deletions
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log("\nMerge process completed!");
}

main().catch((error) => {
  console.error("Error during merge process:", error);
  process.exitCode = 1;
});
