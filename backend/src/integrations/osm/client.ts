import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import { 
  GeocodeResult, 
  ReverseGeocodeResult, 
  OSMSearchParams, 
  OSMReverseParams 
} from './types';

/**
 * OpenStreetMap Nominatim Client
 */
export class OSMClient {
  private axios: AxiosInstance;
  private cache: Map<string, { data: any; expires: number }> = new Map();
  private readonly CACHE_TTL = 3600000; // 1 hour

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
   * @param address The address or place name to search for
   * @param limit Maximum number of results (default: 1)
   */
  async geocode(address: string, limit: number = 1): Promise<GeocodeResult | null> {
    const cacheKey = `geocode:${address}:${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      logger.debug(`OSM cache hit: ${cacheKey}`);
      return cached.data;
    }

    try {
      const params: OSMSearchParams = {
        q: address,
        format: 'json',
        limit: limit,
        addressdetails: 1
      };

      const response = await this.axios.get('/search', { params });

      if (response.data && response.data.length > 0) {
        const firstResult = response.data[0];
        const result: GeocodeResult = {
          lat: parseFloat(firstResult.lat),
          lon: parseFloat(firstResult.lon),
          displayName: firstResult.display_name,
          boundingBox: firstResult.boundingbox.map((v: string) => parseFloat(v)),
          type: firstResult.type,
          class: firstResult.class,
          importance: firstResult.importance
        };

        this.cache.set(cacheKey, { data: result, expires: Date.now() + this.CACHE_TTL });
        logger.info(`Geocoded: ${address} → ${result.lat}, ${result.lon}`);
        return result;
      }

      logger.info(`Geocoding found no results for: ${address}`);
      return null;
    } catch (error) {
      logger.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param lat Latitude
   * @param lon Longitude
   */
  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    const cacheKey = `reverse:${lat},${lon}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }

    try {
      const params: OSMReverseParams = {
        lat,
        lon,
        format: 'json',
        addressdetails: 1,
        zoom: 18
      };

      const response = await this.axios.get('/reverse', { params });

      if (response.data && !response.data.error) {
        const result: ReverseGeocodeResult = {
          displayName: response.data.display_name,
          address: response.data.address || {},
          lat: parseFloat(response.data.lat),
          lon: parseFloat(response.data.lon),
          osmId: response.data.osm_id,
          osmType: response.data.osm_type
        };

        this.cache.set(cacheKey, { data: result, expires: Date.now() + this.CACHE_TTL });
        logger.info(`Reverse geocoded: ${lat},${lon} → ${result.displayName}`);
        return result;
      }

      return null;
    } catch (error) {
      logger.error('Reverse geocoding error:', error);
      return null;
    }
  }
  
  /**
   * Clear internal cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton instance
export const osmClient = new OSMClient();
