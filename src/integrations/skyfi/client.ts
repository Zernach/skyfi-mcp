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
import { getFallbackArchiveSearch, ArchiveSearchFallbackParams } from './fallback-data';

const ARCHIVE_FALLBACK_ERROR_CODES = new Set([
  'SERVER_ERROR',
  'TIMEOUT_ERROR',
  'RATE_LIMIT_ERROR',
  'NOT_FOUND_ERROR',
]);
const TRANSIENT_ERRNO_CODES = new Set([
  'ENOTFOUND',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EHOSTUNREACH',
]);

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
    logger.error('Axios error intercepted', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data,
      url: error.config?.url,
      method: error.config?.method,
    });

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data as any;

      switch (status) {
        case 401:
          logger.error('SkyFi API authentication error', { status, data });
          throw new SkyFiAuthError(data?.message, data);
        case 404:
          logger.error('SkyFi API not found error', { status, data });
          throw new SkyFiNotFoundError(data?.message, data);
        case 400:
          logger.error('SkyFi API validation error', { status, data });
          throw new SkyFiValidationError(data?.message, data);
        case 429:
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          logger.error('SkyFi API rate limit error', { status, retryAfter, data });
          throw new SkyFiRateLimitError(data?.message, retryAfter, data);
        case 408:
          logger.error('SkyFi API timeout error', { status, data });
          throw new SkyFiTimeoutError(data?.message, data);
        default:
          if (status >= 500) {
            logger.error('SkyFi API server error', { status, data });
            throw new SkyFiServerError(data?.message, status, data);
          }
      }
    }

    if (error.code === 'ECONNABORTED') {
      logger.error('Request timeout', { code: error.code });
      throw new SkyFiTimeoutError('Request timeout');
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      logger.error('Connection error', {
        code: error.code,
        message: error.message,
        url: error.config?.url
      });
      throw new SkyFiError(`Connection failed: ${error.message}`);
    }

    logger.error('Unknown SkyFi API error', {
      message: error.message,
      code: error.code
    });
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
    logger.debug('Making SkyFi API request', {
      method,
      endpoint,
      retryCount,
      hasData: !!data,
    });

    // Wait for rate limit
    await this.rateLimiter.waitForToken();

    try {
      const fullUrl = `${this.baseUrl}${endpoint}`;
      logger.debug('Sending request', {
        method,
        url: fullUrl,
        headers: {
          'X-Skyfi-Api-Key': this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'MISSING',
        }
      });

      const response = await this.axios.request<SkyFiAPIResponse<T>>({
        method,
        url: endpoint,
        data,
      });

      logger.debug('Received response', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
        success: response.data.success,
      });

      if (response.data.success) {
        return response.data.data as T;
      }

      const errorMessage = response.data.error?.message || 'API request failed';
      logger.error('API returned unsuccessful response', {
        error: errorMessage,
        errorCode: response.data.error?.code,
        responseData: response.data,
      });

      throw new SkyFiError(
        errorMessage,
        undefined,
        response.data.error?.code
      );
    } catch (error) {
      // Log detailed error information
      if (error instanceof SkyFiError) {
        logger.error('SkyFi API error', {
          errorName: error.name,
          errorMessage: error.message,
          errorCode: error.code,
          method,
          endpoint,
          retryCount,
        });
      } else if (error instanceof Error) {
        logger.error('Request error', {
          errorName: error.name,
          errorMessage: error.message,
          stack: error.stack,
          method,
          endpoint,
          retryCount,
        });
      } else {
        logger.error('Unknown request error', {
          error: String(error),
          method,
          endpoint,
          retryCount,
        });
      }

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
    logger.info('archiveSearch called', {
      params,
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey
    });

    const cacheKey = `archive:${JSON.stringify(params)}`;

    try {
      const result = await this.getCached(cacheKey, 300, () =>
        this.request<ArchiveSearchResponse>('POST', '/archive/search', params)
      );

      logger.info('archiveSearch succeeded', {
        resultCount: result.results?.length || 0,
        hasResults: !!result.results
      });

      return result;
    } catch (error) {
      logger.error('archiveSearch failed', {
        error: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        params,
        baseUrl: this.baseUrl,
      });

      const fallback = this.tryArchiveFallback(params, error);
      if (fallback) {
        logger.warn('Using fallback archive search dataset', {
          params,
          fallbackCount: fallback.results.length,
        });
        this.cache.set(cacheKey, { data: fallback, expires: Date.now() + 60 * 1000 });
        return fallback;
      }

      throw error;
    }
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

  private tryArchiveFallback(
    params: ArchiveSearchParams,
    error: unknown
  ): ArchiveSearchResponse | null {
    if (!this.shouldUseArchiveFallback(error)) {
      return null;
    }

    const fallbackParams: ArchiveSearchFallbackParams = {
      ...params,
    };

    const fallback = getFallbackArchiveSearch(fallbackParams);
    if (!fallback) {
      logger.warn('No matching fallback archive dataset for parameters', {
        params: fallbackParams,
      });
      return null;
    }

    return fallback;
  }

  private shouldUseArchiveFallback(error: unknown): boolean {
    if (!error) {
      return false;
    }

    if (error instanceof SkyFiAuthError || error instanceof SkyFiValidationError) {
      return false;
    }

    if (error instanceof SkyFiError) {
      if (!error.code) {
        return true;
      }

      if (ARCHIVE_FALLBACK_ERROR_CODES.has(error.code)) {
        return true;
      }

      return false;
    }

    const maybeErrno = error as NodeJS.ErrnoException;
    if (typeof maybeErrno?.code === 'string' && TRANSIENT_ERRNO_CODES.has(maybeErrno.code)) {
      return true;
    }

    return false;
  }
}

// Singleton instance
export const skyfiClient = new SkyFiClient();
