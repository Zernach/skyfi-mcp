export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  boundingBox: [number, number, number, number];
  type?: string;
  class?: string;
  importance?: number;
}

export interface Address {
  road?: string;
  suburb?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  country_code?: string;
  [key: string]: string | undefined;
}

export interface ReverseGeocodeResult {
  displayName: string;
  address: Address;
  lat: number;
  lon: number;
  osmId?: string;
  osmType?: string;
}

export interface OSMSearchParams {
  q: string;
  format?: 'json';
  limit?: number;
  addressdetails?: number;
  extratags?: number;
  namedetails?: number;
}

export interface OSMReverseParams {
  lat: number;
  lon: number;
  format?: 'json';
  zoom?: number;
  addressdetails?: number;
}

