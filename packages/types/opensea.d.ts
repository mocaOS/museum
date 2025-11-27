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

export type OpenSeaOfferItem = {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
};

export type OpenSeaConsiderationItem = {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
  recipient: string;
};

export type OpenSeaProtocolParameters = {
  offerer: string;
  offer: OpenSeaOfferItem[];
  consideration: OpenSeaConsiderationItem[];
  startTime: string;
  endTime: string;
  orderType: number;
  zone: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: number;
  counter: number;
};

export type OpenSeaProtocolData = {
  parameters: OpenSeaProtocolParameters;
  signature: string | null;
};

export type OpenSeaPriceValue = {
  currency: string;
  decimals: number;
  value: string;
};

export type OpenSeaPrice = {
  current: OpenSeaPriceValue;
};

export type OpenSeaListing = {
  order_hash: string;
  chain: string;
  protocol_data: OpenSeaProtocolData;
  protocol_address: string;
  remaining_quantity: number;
  price: OpenSeaPrice;
  type: string;
  status: string;
};

export type OpenSeaListingsResponse = {
  listings: OpenSeaListing[];
  next?: string;
};