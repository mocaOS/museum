import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectus, createItem, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";
import { CryptoArtwork } from "../../packages/types/google-sheets";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const failedNFTs: CryptoArtwork[] = [];

const CHAINS = {
  1: "ethereum",
  137: "matic",
};

(async () => {
  // fetch google sheet here
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./moca-442521-ad8b5772ca89.json"), "utf-8"));

  const serviceAccountAuth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [ "https://www.googleapis.com/auth/spreadsheets" ],
  });

  const doc = new GoogleSpreadsheet("1HhLnZX6XtLwFKc5sFKyprhLpGwDmg9BEKWGBIaTNN6A", serviceAccountAuth);

  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  const sheetData: CryptoArtwork[] = rows.map(row => row.toObject() as CryptoArtwork);

  console.log(`Loaded ${sheetData.length} rows from Google Sheet`);

  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  for (const item of sheetData) {
    const chain = CHAINS[1];

    const address = item["Smart Contract Hash"];
    const identifier = item.TokenID;

    console.log(`Processing item ${item.TokenID} - ${chain} - ${address} - ${identifier}`);

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

    try {
      await client.request(createItem("nfts", {
        contract: directusContract,
        identifier,
        contract_identifier: item.TokenID,
        collection_type: "genesis",
      }));

      console.log(`NFT ${identifier} of ${address} created in Directus Database`);
    } catch (error) {
      failedNFTs.push(item);
      console.error(`NFT ${identifier} of ${address} failed to create in Directus Database`);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`Failed NFTs: ${failedNFTs.length}`);
  console.log(failedNFTs);
})();
