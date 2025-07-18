import { createDirectus, createItem, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const CHAINS = {
  1: "ethereum",
  137: "matic",
};

(async () => {
  const URL = "https://api.museumofcryptoart.com/collection";

  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  const response = await fetch(URL);
  const collections = (await response.json()).collections;

  const collection: any = collections.find((collection: any) => collection.title === "The Permanent Collection");
  const collectionAssets = collection.assets;

  for (const item of collectionAssets) {
    const chain = CHAINS[1];

    const address = item.contract_hash;
    const identifier = item.token_id;

    console.log(`Processing item ${item.token_id} - ${chain} - ${address} - ${identifier}`);

    // Check if NFT is already in Directus Database - if so, continue to next item
    const directusNFTs = await client.request(readItems("nfts", {
      filter: {
        contract: {
          address: {
            _eq: address,
          },
        },
        identifier: {
          _eq: identifier,
        },
      },
      fields: [ "id" ],
    }));

    if (directusNFTs.length) {
      console.log(`NFT ${identifier} of ${address} is already in Directus Database. Update collection type and continue...`);

      for (const nft of directusNFTs) {
        await client.request(updateItem("nfts", nft.id, {
          collection_type: "permanent",
        }));
      }

      continue;
    }

    // Check if Contract is already in Directus Database - if not, create it
    const directusContracts = await client.request(readItems("contracts", {
      fields: [ "*" ],
      filter: {
        address: {
          _eq: address,
        },
      },
    }));

    let directusContract: Contracts;

    if (!directusContracts.length) {
      console.log(`Contract ${address} is not in Directus Database. Create it...`);

      directusContract = await client.request(createItem("contracts", {
        address,
        chain,
      })) as Contracts;

      console.log(`Contract ${address} created in Directus Database`);

      await new Promise(resolve => setTimeout(resolve, 200));
    } else {
      directusContract = directusContracts[0];
    }

    // Create NFT in Directus Database
    console.log(`Create NFT ${identifier} of ${address} in Directus Database...`);

    if (!directusContract) throw new Error(`Contract ${address} not found in Directus Database`);

    await client.request(createItem("nfts", {
      contract: directusContract,
      identifier,
      contract_identifier: item.item_id,
      collection_type: "permanent",
    }));

    console.log(`NFT ${identifier} of ${address} created in Directus Database`);

    await new Promise(resolve => setTimeout(resolve, 200));
  }
})();
