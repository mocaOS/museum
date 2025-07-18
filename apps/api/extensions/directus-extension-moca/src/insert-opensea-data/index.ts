import { defineHook } from "@directus/extensions-sdk";
import axios from "axios";
import { Contracts, Nfts } from "../../types";

export default defineHook(({ filter }, { env }) => {
  filter("items.create", async (input: any, { collection }) => {
    if (collection === "contracts") {
      const { data: contract } = await axios.get(`https://api.opensea.io/api/v2/chain/${input.chain}/contract/${input.address}`, {
        headers: {
          "X-API-KEY": env.OPENSEA_API_KEY,
        },
      });

      return {
        ...input,
        name: contract.name,
        collection: contract.collection,
        contract_standard: contract.contract_standard,
        response_opensea: contract,
      } as Partial<Contracts>;
    }

    if (collection === "nfts") {
      const { data: { nft } } = await axios.get(`https://api.opensea.io/api/v2/chain/${input.contract.chain}/contract/${input.contract.address}/nfts/${input.identifier}`, {
        headers: {
          "X-API-KEY": env.OPENSEA_API_KEY,
        },
      });

      // if (nft.image_url) {
      //   const { data: { data: media_info } } = await axios.get(`https://media.qwellcode.de/api/info/${encodeURL(nft.image_url)}`).catch((e) => {
      //     return {
      //       success: false,
      //       data: "",
      //     };
      //   });
      //   input.media_info = media_info;
      // }
      //
      // if (nft.display_image_url) {
      //   const { data: { data: display_media_info } } = await axios.get(`https://media.qwellcode.de/api/info/${encodeURL(nft.display_image_url)}`).catch((e) => {
      //     return {
      //       success: false,
      //       data: "",
      //     };
      //   });
      //   input.display_media_info = display_media_info;
      // }
      //
      // if (nft.display_animation_url) {
      //   const { data: { data: display_animation_info } } = await axios.get(`https://media.qwellcode.de/api/info/${encodeURL(nft.display_animation_url)}`).catch((e) => {
      //     return {
      //       success: false,
      //       data: "",
      //     };
      //   });
      //   input.display_animation_info = display_animation_info;
      // }

      return {
        ...input,
        // name max 255 chars
        name: nft.name?.slice(0, 255),
        collection: nft.collection,
        response_opensea: nft,
        contract: input.contract,
      } as Partial<Nfts>;
    }

    return input;
  });
});
