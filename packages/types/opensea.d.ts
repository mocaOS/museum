export type OpenSeaAsset = {
  identifier: string;
  collection: string;
  contract: string;
  token_standard: string;
  name: string;
  description: string;
  image_url: string;
  display_image_url: string;
  display_animation_url: string | null;
  metadata_url: string;
  opensea_url: string;
  updated_at: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  animation_url: string | null;
  is_suspicious: boolean;
  creator: string;
  traits: Array<{
    trait_type: string;
    display_type: string | null;
    max_value: string | null;
    value: string;
  }>;
  owners: Array<{
    address: string;
    quantity: number;
  }>;
  rarity: any | null;
};