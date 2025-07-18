import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectus, createItem, readItems, rest, staticToken } from "@directus/sdk";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";
import { Contracts, CustomDirectusTypes } from "./types";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHEET_ID = "1HhLnZX6XtLwFKc5sFKyprhLpGwDmg9BEKWGBIaTNN6A";

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

async function getSheetData() {
  const serviceAccount = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./moca-442521-ad8b5772ca89.json"), "utf-8"));

  const serviceAccountAuth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [ "https://www.googleapis.com/auth/spreadsheets" ],
  });

  const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  const rows = await sheet.getRows();

  return rows.map(row => [ row.get("Smart Contract Hash"), row.get("TokenID") ]);
}

async function findOrCreateContract(address: string): Promise<Contracts> {
  // Check if contract exists, using case-insensitive comparison
  const existingContracts = await client.request(readItems("contracts", {
    filter: {
      address: {
        _eq: address.toLowerCase(),
      },
    },
  }));

  if (existingContracts.length > 0) {
    return existingContracts[0] as Contracts;
  }

  // Create new contract if it doesn't exist
  console.log(`Creating new contract: ${address}`);
  const newContract = await client.request(createItem("contracts", {
    address: address.toLowerCase(), // Store address in lowercase
    chain: "ethereum", // Default to ethereum, adjust if needed
  })) as Contracts;

  await new Promise(resolve => setTimeout(resolve, 200));
  return newContract;
}

async function findOrCreateNFT(contractAddress: string, tokenId: string) {
  // Check if NFT exists
  const existingNFTs = await client.request(readItems("nfts", {
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
    fields: [ "id" ],
  }));

  if (existingNFTs.length > 0) {
    console.log(`NFT ${tokenId} of ${contractAddress} already exists`);
    return existingNFTs[0];
  }

  // Get or create contract
  const contract = await findOrCreateContract(contractAddress);

  // Create new NFT
  console.log(`Creating new NFT: ${tokenId} for contract ${contractAddress}`);
  const newNFT = await client.request(createItem("nfts", {
    contract,
    identifier: tokenId,
  }));

  await new Promise(resolve => setTimeout(resolve, 200));
  return newNFT;
}

async function main() {
  try {
    const sheetData = await getSheetData();
    console.log(`Found ${sheetData.length} rows in sheet`);

    for (const [ contractAddress, tokenId ] of sheetData) {
      console.log(`Processing: Contract ${contractAddress}, Token ID ${tokenId}`);

      try {
        await findOrCreateNFT(contractAddress, tokenId);
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error processing NFT ${tokenId} of ${contractAddress}:`, error);
        continue;
      }
    }

    console.log("Sync completed successfully");
  } catch (error) {
    console.error("Error during sync:", error);
    process.exitCode = 1;
  }
}

main();
