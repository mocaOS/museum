import { createDirectus, readItems, rest, staticToken, updateItem } from "@directus/sdk";
import { encodeURL } from "js-base64";
import axios from "axios";
import dotenv from "dotenv";
import { CustomDirectusTypes, Nfts } from "./types";

dotenv.config();

const client = createDirectus<CustomDirectusTypes>("http://localhost:8055")
  .with(staticToken(process.env.DIRECTUS_API_KEY_DEV!))
  .with(rest());

const axiosClient = axios.create({
  timeout: 45000,
});

let offset = 0;
const limit = 1;

async function main() {
  setInterval(fetchNFT, 10);
}

async function fetchNFT() {
  const nfts = await client.request(readItems("nfts", {
    sort: [ "-id" ],
    filter: {
      _or: [
        {
          media_info: {
            _null: true,
          },
        },
        {
          display_media_info: {
            _null: true,
          },
        },
        {
          display_animation_info: {
            _null: true,
          },
        },
      ],
    },
    limit,
    offset,
  }));

  if (nfts.length !== 0) {
    const nft = nfts[0];

    offset += limit;

    processNFT(nft).catch((error) => {
      console.error(`Failed to process NFT ${nft.id}:`, error);
    });
  } else {
    console.log("No more NFTs to process.. try to continue");
    offset += limit;
  }
}

async function processNFT(nft: Nfts) {
  console.log(`Processing NFT ${nft.id}`);

  const response_opensea: any = nft.response_opensea;

  // if (response_opensea.image_url) {
  //   requests.push(axiosClient.get(`https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encodeURL(response_opensea.image_url.replace("w=500", "w=2048"))}`));
  // }

  if (response_opensea.image_url && !nft.media_info) {
    axiosClient.get(`https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encodeURL(response_opensea.image_url.replace("w=500", "w=2048"))}`).then(async (result) => {
      if (result.status === 200) {
        const media_info = result.data.data;
        await client.request(updateItem("nfts", nft.id, { media_info }));
        console.log(`Fetched media_info for NFT ${nft.id}`);
      } else {
        console.error(`Failed to fetch media_info for NFT ${nft.id}`);
      }
    }).catch(() => {
      console.error(`Failed to fetch media_info for NFT ${nft.id}`);
    });
  }

  if (response_opensea.display_image_url && !nft.display_media_info) {
    axiosClient.get(`https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encodeURL(response_opensea.display_image_url.replace("w=500", "w=2048"))}`).then(async (result) => {
      if (result.status === 200) {
        const display_media_info = result.data.data;
        await client.request(updateItem("nfts", nft.id, { display_media_info }));
        console.log(`Fetched display_media_info for NFT ${nft.id}`);
      } else {
        console.error(`Failed to fetch display_media_info for NFT ${nft.id}`);
      }
    }).catch(() => {
      console.error(`Failed to fetch display_media_info for NFT ${nft.id}`);
    });
  }

  if (response_opensea.display_animation_url && !nft.display_animation_info) {
    axiosClient.get(`https://us-central1-mediaproxy-682a2.cloudfunctions.net/info/${encodeURL(response_opensea.display_animation_url.replace("w=500", "w=2048"))}`).then(async (result) => {
      if (result.status === 200) {
        const display_animation_info = result.data.data;
        await client.request(updateItem("nfts", nft.id, { display_animation_info }));
        console.log(`Fetched display_animation_info for NFT ${nft.id}`);
      } else {
        console.error(`Failed to fetch display_animation_info for NFT ${nft.id}`);
      }
    }).catch(() => {
      console.error(`Failed to fetch display_animation_info for NFT ${nft.id}`);
    });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
