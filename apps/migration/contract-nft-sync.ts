import axios from "axios";
import { createDirectus, createItem, readItems, rest, staticToken } from "@directus/sdk";
import dotenv from "dotenv";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const CHAINS = {
  1: "ethereum",
  137: "matic",
};

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

async function main() {
  let start = 31000;
  const limit = 1000;

  while (true) {
    let { data: items } = await axios.get(`https://api.museumofcryptoart.com/items?_limit=${limit}&_start=${start}`);

    // items = items.filter((item: any) => item.collection_address !== "0x86935f11c86623dec8a25696e1c19a8659cbf95d");
    // items = items.filter((item: any) => item.collection_address !== "0x5b8c7104122ab9d33550d43d2343b20dcd455126");
    items = items.filter((item: any) => (item.collection_address !== "0x75b8fd69f6509289cf717dd1faaf5eb88e7dae35" && item.token_id !== "1"));
    items = items.filter((item: any) => (item.collection_address !== "0xef86fa3809e1b0e155c5ca16226622fa09d9c70a" && item.token_id !== "3"));
    items = items.filter((item: any) => (item.collection_address !== "0xfc310e8b76bb01d94fbbbc6c808cc5bccec4673c" && item.token_id !== "2"));
    items = items.filter((item: any) => (item.collection_address !== "0x019bece4e993f01cc297daf2dd7f252dc0302308" && item.token_id !== "10"));
    items = items.filter((item: any) => (item.collection_address !== "0x8b1f482da7930b556e23a2cd78609c4502ffc17b" && item.token_id !== "6"));
    items = items.filter((item: any) => (item.collection_address !== "0x86935f11c86623dec8a25696e1c19a8659cbf95d" && item.token_id !== "7033"));
    items = items.filter((item: any) => (item.collection_address !== "0x5b8c7104122ab9d33550d43d2343b20dcd455126" && item.token_id !== "126"));

    if (items.length === 0) break;

    console.log(`We have ${items.length} items to process`);

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const chain = CHAINS[item.chain_id];
      const address = item.collection_address;
      const identifier = item.token_id;

      console.log(`Processing item ${start + i + 1} - ${chain} - ${address} - ${identifier}`);

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
        console.log(`NFT ${identifier} of ${address} is already in Directus Database. Continue...`);
        continue;
      }

      // Check if Contract is already in Directus Database - if not, create it
      const directusContracts = await client.request(readItems("contracts", {
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
        }));

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
      }));

      console.log(`NFT ${identifier} of ${address} created in Directus Database`);

      await new Promise(resolve => setTimeout(resolve, 200));
    }

    start += limit;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
