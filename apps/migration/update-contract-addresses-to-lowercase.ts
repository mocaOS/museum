import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

// Track contracts that were updated and those that failed
const updatedContracts: Contracts[] = [];
const failedContracts: any[] = [];

(async () => {
  console.log("Starting contract address normalization to lowercase...");

  // Connect to Directus
  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  // Fetch all contracts
  const contracts = await client.request(readItems("contracts", {
    fields: [ "*" ],
    limit: -1,
  })) as Contracts[];

  console.log(`Found ${contracts.length} contracts to process`);

  // Process each contract
  for (const contract of contracts) {
    if (!contract.address) {
      console.log("Contract with missing address. Skipping...");
      continue;
    }

    const currentAddress = contract.address;
    const lowercaseAddress = currentAddress.toLowerCase();

    // Skip if address is already lowercase
    if (currentAddress === lowercaseAddress) {
      console.log(`Contract ${contract.address} is already lowercase`);
      continue;
    }

    console.log(`Updating contract ${contract.address} to lowercase: ${lowercaseAddress}`);

    try {
      // Update the contract address to lowercase
      await client.request(updateItem("contracts", contract.address, {
        address: lowercaseAddress,
      }));

      console.log(`Updated contract ${contract.address} to lowercase: ${lowercaseAddress}`);
      updatedContracts.push(contract);
    } catch (error) {
      console.error(`Failed to update contract ${contract.address}:`, error);
      failedContracts.push({
        address: currentAddress,
        error,
      });
    }

    // Prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Print summary
  console.log("\nSummary:");
  console.log(`Total contracts processed: ${contracts.length}`);
  console.log(`Updated contracts: ${updatedContracts.length}`);
  console.log(`Failed to update: ${failedContracts.length}`);

  if (failedContracts.length > 0) {
    console.log("\nFailed contracts:");
    console.log(failedContracts);
  }

  if (updatedContracts.length > 0) {
    console.log("\nUpdated contract addresses:");
    updatedContracts.forEach((contract, index) => {
      console.log(`${index + 1}. ${contract.address.toLowerCase()}`);
    });
  }

  console.log("\nOperation completed!");
})().catch((error) => {
  console.error("An error occurred:", error);
  process.exitCode = 1;
});
