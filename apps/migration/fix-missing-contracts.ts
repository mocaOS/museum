import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import dotenv from "dotenv";
import { CustomDirectusTypes } from "./types";

dotenv.config();

const CHAINS = {
  1: "ethereum",
  137: "matic",
};

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

async function main() {
  // get nfts without contract limit to one
  // process in while loop
  // get contract from nft.response_opensea.contract
  // find contract in directus database
  // update nft with correct contract

  while (true) {
    const nftsWithMissingContract = await client.request(readItems("nfts", {
      filter: {
        contract: {
          _null: true,
        },
      },
      limit: 1,
    }));

    if (!nftsWithMissingContract.length) break;

    const contract = await client.request(readItems("contracts", {
      filter: {
        address: {
          // @ts-expect-error
          _eq: nftsWithMissingContract[0].response_opensea.contract,
        },
      },
    }));

    await client.request(updateItem("nfts", nftsWithMissingContract[0].id, {
      contract: contract[0].address,
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
