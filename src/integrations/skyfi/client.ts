import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import { RateLimiter } from './ratelimit';
import {
  ArchiveSearchParams,
  ArchiveSearchResponse,
  Order,
  OrderFilters,
  OrderParams,
  Tasking,
  TaskingParams,
  PriceEstimateParams,
  PriceEstimate,
  WebhookParams,
  Webhook,
  SkyFiAPIResponse,
} from './types';
import {
  SkyFiError,
  SkyFiAuthError,
  SkyFiRateLimitError,
  SkyFiNotFoundError,
  SkyFiValidationError,
  SkyFiServerError,
  SkyFiTimeoutError,
} from './errors';

export interface SkyFiClientConfig {
  apiKey: string;
  baseUrl: string;
  timeout?: number;
  retries?: number;
}

/**
 * SkyFi API Client
 */
export class SkyFiClient {
  private apiKey: string;
  private baseUrl: string;
  private axios: AxiosInstance;
  private rateLimiter: RateLimiter;
  private retries: number;
  private cache: Map<string, { data: any; expires: number }> = new Map();

  constructor(clientConfig?: Partial<SkyFiClientConfig>) {
    this.apiKey = clientConfig?.apiKey || config.skyfi.apiKey;
    this.baseUrl = clientConfig?.baseUrl || config.skyfi.baseUrl;
    this.retries = clientConfig?.retries || 3;
    this.rateLimiter = new RateLimiter(100, 10);

    this.axios = axios.create({
      baseURL: this.baseUrl,
      timeout: clientConfig?.timeout || 30000,
      headers: {
        'X-Skyfi-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'SkyFi-MCP/1.0',
      },
    });

    // Add response interceptor for error handling
    this.axios.interceptors.response.use(
      (response) => response,
      (error) => this.handleError(error)
    );
  }

  /**
   * Handle API errors and map to custom error classes
   */
  private handleError(error: AxiosError): never {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          throw new SkyFiAuthError(data?.message, data);
        case 404:
          throw new SkyFiNotFoundError(data?.message, data);
        case 400:
          throw new SkyFiValidationError(data?.message, data);
        case 429:
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          throw new SkyFiRateLimitError(data?.message, retryAfter, data);
        case 408:
          throw new SkyFiTimeoutError(data?.message, data);
        default:
          if (status >= 500) {
            throw new SkyFiServerError(data?.message, status, data);
          }
      }
    }

    if (error.code === 'ECONNABORTED') {
      throw new SkyFiTimeoutError('Request timeout');
    }

    throw new SkyFiError(error.message || 'Unknown error');
  }

  /**
   * Make API request with retry logic and rate limiting
   */
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    retryCount = 0
  ): Promise<T> {
    // Wait for rate limit
    await this.rateLimiter.waitForToken();

    try {
      const response = await this.axios.request<SkyFiAPIResponse<T>>({
        method,
        url: endpoint,
        data,
      });

      if (response.data.success) {
        return response.data.data as T;
      }

      throw new SkyFiError(
        response.data.error?.message || 'API request failed',
        undefined,
        response.data.error?.code
      );
    } catch (error) {
      // Retry logic for server errors
      if (
        retryCount < this.retries &&
        (error instanceof SkyFiServerError || error instanceof SkyFiTimeoutError)
      ) {
        const delay = Math.pow(2, retryCount) * 1000;
        logger.warn(`Retrying request after ${delay}ms (attempt ${retryCount + 1}/${this.retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.request<T>(method, endpoint, data, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Get from cache or fetch
   */
  private async getCached<T>(
    key: string,
    ttl: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      logger.debug(`Cache hit: ${key}`);
      return cached.data as T;
    }

    logger.debug(`Cache miss: ${key}`);
    const data = await fetcher();
    this.cache.set(key, { data, expires: Date.now() + ttl * 1000 });
    return data;
  }

  /**
   * Archive Search
   */
  async archiveSearch(params: ArchiveSearchParams): Promise<ArchiveSearchResponse> {
    const cacheKey = `archive:${JSON.stringify(params)}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<ArchiveSearchResponse>('POST', '/archive/search', params)
    );
  }

  /**
   * Get Order by ID
   */
  async getOrder(orderId: string): Promise<Order> {
    const cacheKey = `order:${orderId}`;
    return this.getCached(cacheKey, 60, () =>
      this.request<Order>('GET', `/orders/${orderId}`)
    );
  }

  /**
   * List Orders
   */
  async listOrders(filters?: OrderFilters): Promise<Order[]> {
    const cacheKey = `orders:${JSON.stringify(filters)}`;
    return this.getCached(cacheKey, 60, () =>
      this.request<Order[]>('GET', '/orders', filters)
    );
  }

  /**
   * Create Order
   */
  async createOrder(params: OrderParams): Promise<Order> {
    // Clear cache on create
    this.cache.clear();
    return this.request<Order>('POST', '/orders', params);
  }

  /**
   * Get Tasking by ID
   */
  async getTasking(taskId: string): Promise<Tasking> {
    const cacheKey = `tasking:${taskId}`;
    return this.getCached(cacheKey, 60, () =>
      this.request<Tasking>('GET', `/tasking/${taskId}`)
    );
  }

  /**
   * Create Tasking
   */
  async createTasking(params: TaskingParams): Promise<Tasking> {
    return this.request<Tasking>('POST', '/tasking', params);
  }

  /**
   * Estimate Price
   */
  async estimatePrice(params: PriceEstimateParams): Promise<PriceEstimate> {
    const cacheKey = `price:${JSON.stringify(params)}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<PriceEstimate>('POST', '/pricing/estimate', params)
    );
  }

  /**
   * Create Webhook
   */
  async createWebhook(params: WebhookParams): Promise<Webhook> {
    return this.request<Webhook>('POST', '/webhooks', params);
  }

  /**
   * List Webhooks
   */
  async listWebhooks(): Promise<Webhook[]> {
    const cacheKey = 'webhooks:list';
    return this.getCached(cacheKey, 3600, () =>
      this.request<Webhook[]>('GET', '/webhooks')
    );
  }

  /**
   * Delete Webhook
   */
  async deleteWebhook(webhookId: string): Promise<void> {
    this.cache.delete('webhooks:list');
    return this.request<void>('DELETE', `/webhooks/${webhookId}`);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }
}

// Singleton instance
export const skyfiClient = new SkyFiClient();
