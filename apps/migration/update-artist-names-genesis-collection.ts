import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import { JWT } from "google-auth-library";
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";
import { CryptoArtwork } from "../../packages/types/google-sheets";
import { OpenSeaAsset } from "../../packages/types/opensea";
import { CustomDirectusTypes } from "./types";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const failedNFTs: any[] = [];

(async () => {
  // Fetch Google Sheet data
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

  // Connect to Directus
  const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
    .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
    .with(rest());

  let updatedCount = 0;
  let notFoundCount = 0;

  // Process each entry from Google Sheet
  for (const sheetEntry of sheetData) {
    const contractAddress = sheetEntry["Smart Contract Hash"];
    const tokenId = sheetEntry.TokenID;
    const artistName = sheetEntry.Artist;
    const collectionType = sheetEntry.Collection?.toLowerCase();

    if (!contractAddress || !tokenId) {
      console.log("Missing contract address or token ID in sheet entry");
      continue;
    }

    console.log(`Processing sheet entry: ${contractAddress} - ${tokenId}`);

    // Find matching NFT in Directus
    const matchingNFTs = await client.request(readItems("nfts", {
      fields: [ "id", "identifier", "collection_type", "contract", "response_opensea" ],
      filter: {
        identifier: {
          _eq: tokenId,
        },
      },
      deep: {
        contract: {
          fields: [ "id", "address" ],
        },
      },
      limit: -1,
    }));

    // Find NFT with matching contract address (case-insensitive)
    const matchingNFT = matchingNFTs.find((nft) => {
      const responseData = nft.response_opensea as OpenSeaAsset;
      return responseData?.contract?.toLowerCase() === contractAddress.toLowerCase();
    });

    if (!matchingNFT) {
      console.log(`No matching NFT found in Directus for: ${contractAddress} - ${tokenId}`);
      notFoundCount++;
      continue;
    }

    const nft = matchingNFT;

    // Find or verify contract in Directus
    let directusContract;
    if (!nft.contract || typeof nft.contract === "string") {
      console.log(`Looking up contract for NFT ${nft.id}...`);

      const directusContracts = await client.request(readItems("contracts", {
        fields: [ "*" ],
        filter: {
          address: {
            _eq: (nft.response_opensea as OpenSeaAsset).contract?.toLowerCase(),
          },
        },
        limit: 1,
      }));

      if (!directusContracts.length) {
        console.warn(`No contract found in Directus for NFT: ${nft.id}. Skipping.`);
        continue;
      }
    }

    // Determine collection type based on sheet data
    const finalCollectionType = collectionType === "genesis"
      ? "genesis"
      : collectionType === "permanent"
        ? "permanent"
        : undefined;

    // Update the NFT with artist name, contract, and collection type
    try {
      await client.request(updateItem("nfts", nft.id, {
        artist_name: artistName,
        collection_type: finalCollectionType,
      }));

      console.log(`Updated NFT ${nft.id} with artist "${artistName}" and collection type "${finalCollectionType}"`);
      updatedCount++;
    } catch (error) {
      console.error(`Failed to update NFT: ${contractAddress} - ${tokenId}`, error);
      failedNFTs.push({
        id: nft.id,
        contractAddress,
        tokenId,
        error,
      });
    }
  }

  console.log("\nSummary:");
  console.log(`Total sheet entries processed: ${sheetData.length}`);
  console.log(`Updated NFTs: ${updatedCount}`);
  console.log(`Not found in Directus: ${notFoundCount}`);
  console.log(`Failed to update: ${failedNFTs.length}`);

  if (failedNFTs.length > 0) {
    console.log("\nFailed NFTs:");
    console.log(failedNFTs);
  }
})();
