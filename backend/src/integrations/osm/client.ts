import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  boundingBox: [number, number, number, number];
}

export interface ReverseGeocodeResult {
  displayName: string;
  address: {
    road?: string;
    city?: string;
    state?: string;
    country?: string;
    postcode?: string;
  };
}

/**
 * OpenStreetMap Nominatim Client
 */
export class OSMClient {
  private axios: AxiosInstance;
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor() {
    this.axios = axios.create({
      baseURL: config.osm.nominatimUrl,
      timeout: 10000,
      headers: {
        'User-Agent': 'SkyFi-MCP/1.0',
      },
    });
  }

  /**
   * Geocode address to coordinates
   */
  async geocode(address: string): Promise<GeocodeResult | null> {
    const cacheKey = `geocode:${address}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      logger.debug(`OSM cache hit: ${cacheKey}`);
      return cached.data;
    }

    try {
      const response = await this.axios.get('/search', {
        params: {
          q: address,
          format: 'json',
          limit: 1,
        },
      });

      if (response.data && response.data.length > 0) {
        const result: GeocodeResult = {
          lat: parseFloat(response.data[0].lat),
          lon: parseFloat(response.data[0].lon),
          displayName: response.data[0].display_name,
          boundingBox: response.data[0].boundingbox.map((v: string) => parseFloat(v)),
        };

        this.cache.set(cacheKey, { data: result, expires: Date.now() + 3600000 });
        logger.info(`Geocoded: ${address} → ${result.lat}, ${result.lon}`);
        return result;
      }

      return null;
    } catch (error) {
      logger.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse geocode coordinates to address
   */
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    const cacheKey = `reverse:${lat},${lon}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const response = await this.axios.get('/reverse', {
        params: {
          lat,
          lon,
          format: 'json',
        },
      });

      if (response.data) {
        const result: ReverseGeocodeResult = {
          displayName: response.data.display_name,
          address: response.data.address || {},
        };

        this.cache.set(cacheKey, { data: result, expires: Date.now() + 3600000 });
        logger.info(`Reverse geocoded: ${lat},${lon} → ${result.displayName}`);
        return result;
      }

      return null;
    } catch (error) {
      logger.error('Reverse geocoding error:', error);
      return null;
    }
  }
}

// Singleton instance
export const osmClient = new OSMClient();
