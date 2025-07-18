import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { OpenSeaAsset } from "../../packages/types/opensea";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const failedNFTs: any[] = [];

(async () => {
  // Connect to Directus
  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  // Fetch all NFTs where contract is empty
  const nftsWithEmptyContract = await client.request(readItems("nfts", {
    fields: [ "id", "identifier", "contract", "response_opensea" ],
    filter: {
      _and: [
        {
          contract: {
            _null: true,
          },
        },
      ],
    },
    limit: -1,
  }));

  console.log(`Found ${nftsWithEmptyContract.length} NFTs with empty contracts`);

  let updatedCount = 0;
  let noContractFoundCount = 0;
  let noOpenseaDataCount = 0;

  // Process each NFT
  for (const nft of nftsWithEmptyContract) {
    const responseData = nft.response_opensea as OpenSeaAsset;

    if (!responseData?.contract) {
      console.log(`No OpenSea contract data for NFT ${nft.id}`);
      noOpenseaDataCount++;
      continue;
    }

    console.log(`Processing NFT ${nft.id} with contract address ${responseData.contract}`);

    // Look up contract in Directus
    const directusContracts = await client.request(readItems("contracts", {
      fields: [ "*" ],
      filter: {
        address: {
          _eq: responseData.contract.toLowerCase(),
        },
      },
      limit: 1,
    }));

    if (!directusContracts.length) {
      console.log(`No contract found in Directus for address: ${responseData.contract}`);
      noContractFoundCount++;
      continue;
    }

    const directusContract = directusContracts[0] as Contracts;

    // Update the NFT with the contract
    try {
      await client.request(updateItem("nfts", nft.id, {
        contract: directusContract.address.toLowerCase(),
      }));

      console.log(`Updated NFT ${nft.id} with contract ${directusContract.address}`);
      updatedCount++;
    } catch (error) {
      console.error(`Failed to update NFT ${nft.id}:`, error);
      failedNFTs.push({
        id: nft.id,
        contractAddress: responseData.contract,
        error,
      });
    }
  }

  console.log("\nSummary:");
  console.log(`Total NFTs processed: ${nftsWithEmptyContract.length}`);
  console.log(`Updated NFTs: ${updatedCount}`);
  console.log(`NFTs with no OpenSea data: ${noOpenseaDataCount}`);
  console.log(`Contracts not found in Directus: ${noContractFoundCount}`);
  console.log(`Failed to update: ${failedNFTs.length}`);

  if (failedNFTs.length > 0) {
    console.log("\nFailed NFTs:");
    console.log(failedNFTs);
  }
})();
