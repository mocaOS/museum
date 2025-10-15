export interface OpenSeaListingsResponse {
  listings: OpenSeaListing[];
  next: string;
}

export interface OpenSeaListing {
  order_hash: string;
  chain: string;
  protocol_data: ProtocolData;
  protocol_address: string;
  remaining_quantity: number;
  price: Price;
  type: string;
}

export interface ProtocolData {
  parameters: ProtocolParameters;
  signature: string | null;
}

export interface ProtocolParameters {
  offerer: string;
  offer: OfferItem[];
  consideration: ConsiderationItem[];
  startTime: string;
  endTime: string;
  orderType: number;
  zone: string;
  zoneHash: string;
  salt: string;
  conduitKey: string;
  totalOriginalConsiderationItems: number;
  counter: number;
}

export interface OfferItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
}

export interface ConsiderationItem {
  itemType: number;
  token: string;
  identifierOrCriteria: string;
  startAmount: string;
  endAmount: string;
  recipient: string;
}

export interface Price {
  current: CurrentPrice;
}

export interface CurrentPrice {
  currency: string;
  decimals: number;
  value: string;
}

