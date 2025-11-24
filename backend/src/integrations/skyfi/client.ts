import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config';
import logger from '../../utils/logger';
import { RateLimiter } from './ratelimit';
import {
  ArchiveSearchParams,
  ArchiveSearchResponse,
  ArchiveResponse,
  Order,
  ArchiveOrderResponse,
  TaskingOrderResponse,
  OrderFilters,
  OrderParams,
  ArchiveOrderRequest,
  TaskingOrderRequest,
  Tasking,
  TaskingParams,
  PriceEstimateParams,
  PriceEstimate,
  PricingRequest,
  PricingResponse,
  WebhookParams,
  Webhook,
  CreateAOIParams,
  UpdateAOIParams,
  AOI,
  GeoJSON,
  SkyFiAPIResponse,
  PingResponse,
  HealthCheckResponse,
  WhoamiUser,
  PlatformApiFeasibilityTaskRequest,
  PlatformFeasibilityTaskResponse,
  PlatformApiPassPredictionRequest,
  PlatformPassPredictionResponse,
  CreateNotificationRequest,
  NotificationResponse,
  NotificationWithHistoryResponse,
  ListNotificationsRequest,
  ListNotificationsResponse,
  DemoDeliveryRequest,
  DemoDeliveryResponse,
  OrderRedeliveryRequest,
  OrderInfoTypesResponse,
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
// FALLBACK SYSTEM DISABLED - Imports kept for reference only
// import { getFallbackArchiveSearch, ArchiveSearchFallbackParams } from './fallback-data';

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
        case 429: {
          const retryAfter = parseInt(error.response.headers['retry-after'] || '60');
          logger.error('SkyFi API rate limit error', { status, retryAfter, data });
          throw new SkyFiRateLimitError(data?.message, retryAfter, data);
        }
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

      const response = await this.axios.request<T | SkyFiAPIResponse<T>>({
        method,
        url: endpoint,
        data,
      });

      logger.debug('Received response', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!response.data,
      });

      // Handle both wrapped (SkyFiAPIResponse) and direct responses
      const responseData = response.data as any;
      if (responseData && typeof responseData === 'object' && 'success' in responseData) {
        // Wrapped response
        if (responseData.success) {
          return responseData.data as T;
        }
        const errorMessage = responseData.error?.message || 'API request failed';
        logger.error('API returned unsuccessful response', {
          error: errorMessage,
          errorCode: responseData.error?.code,
          responseData: responseData,
        });
        throw new SkyFiError(
          errorMessage,
          undefined,
          responseData.error?.code
        );
      }

      // Direct response (most SkyFi API endpoints return data directly)
      return responseData as T;
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
   * Archive Search - POST /archives
   * Official endpoint: https://app.skyfi.com/platform-api/archives
   */
  async archiveSearch(params: ArchiveSearchParams): Promise<ArchiveSearchResponse> {
    logger.info('archiveSearch called', {
      params,
      baseUrl: this.baseUrl,
      hasApiKey: !!this.apiKey
    });

    // Normalize params to official API format
    const apiParams: any = {
      aoi: params.aoi || (params.location ? this.convertGeoJSONToWKT(params.location) : undefined),
    };

    if (!apiParams.aoi) {
      throw new SkyFiValidationError('Either aoi (WKT polygon) or location (GeoJSON) is required');
    }

    if (params.fromDate || params.startDate) {
      apiParams.fromDate = params.fromDate || params.startDate;
    }
    if (params.toDate || params.endDate) {
      apiParams.toDate = params.toDate || params.endDate;
    }
    if (params.maxCloudCoveragePercent !== undefined || params.maxCloudCover !== undefined) {
      apiParams.maxCloudCoveragePercent = params.maxCloudCoveragePercent ?? params.maxCloudCover;
    }
    if (params.maxOffNadirAngle !== undefined) {
      apiParams.maxOffNadirAngle = params.maxOffNadirAngle;
    }
    if (params.resolutions) {
      apiParams.resolutions = params.resolutions;
    }
    if (params.productTypes) {
      apiParams.productTypes = params.productTypes;
    }
    if (params.providers) {
      apiParams.providers = params.providers;
    }
    if (params.openData !== undefined) {
      apiParams.openData = params.openData;
    }
    if (params.minOverlapRatio !== undefined) {
      apiParams.minOverlapRatio = params.minOverlapRatio;
    }
    if (params.pageSize || params.limit) {
      apiParams.pageSize = params.pageSize || params.limit;
    }
    if (params.page) {
      apiParams.page = params.page;
    }

    const cacheKey = `archive:${JSON.stringify(apiParams)}`;

    // Use official endpoint: POST /archives
    const result = await this.getCached(cacheKey, 300, () =>
      this.request<ArchiveSearchResponse>('POST', '/archives', apiParams)
    );

    // Handle pagination: if nextPage exists, use GET /archives?page=...
    if (result.nextPage) {
      // Note: For subsequent pages, use GET /archives?page={nextPage}
      // This is handled by the caller if needed
    }

    logger.info('archiveSearch succeeded', {
      resultCount: result.archives?.length || result.results?.length || 0,
      hasResults: !!(result.archives?.length || result.results?.length),
      nextPage: result.nextPage
    });

    return result;
  }

  /**
   * Get Archive by ID - GET /archives/{archive_id}
   */
  async getArchive(archiveId: string): Promise<ArchiveResponse> {
    const cacheKey = `archive:${archiveId}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<ArchiveResponse>('GET', `/archives/${archiveId}`)
    );
  }

  /**
   * Get Archives (pagination) - GET /archives?page=...
   */
  async getArchivesPage(pageToken: string): Promise<ArchiveSearchResponse> {
    return this.request<ArchiveSearchResponse>('GET', `/archives?page=${encodeURIComponent(pageToken)}`);
  }

  /**
   * Get Order by ID - GET /orders/{order_id}
   * Returns OrderInfoTypesResponse with order and events
   */
  async getOrder(orderId: string): Promise<OrderInfoTypesResponse> {
    const cacheKey = `order:${orderId}`;
    return this.getCached(cacheKey, 60, () =>
      this.request<OrderInfoTypesResponse>('GET', `/orders/${orderId}`)
    );
  }

  /**
   * List Orders - GET /orders
   */
  async listOrders(filters?: OrderFilters): Promise<{ orders: Order[]; total: number }> {
    const cacheKey = `orders:${JSON.stringify(filters)}`;
    const queryParams = new URLSearchParams();
    if (filters?.orderType) queryParams.append('orderType', filters.orderType);
    if (filters?.pageNumber !== undefined) queryParams.append('pageNumber', String(filters.pageNumber));
    if (filters?.pageSize) queryParams.append('pageSize', String(filters.pageSize));
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/orders?${queryString}` : '/orders';
    
    return this.getCached(cacheKey, 60, () =>
      this.request<{ orders: Order[]; total: number }>('GET', endpoint)
    );
  }

  /**
   * Create Archive Order - POST /order-archive
   */
  async createArchiveOrder(params: ArchiveOrderRequest): Promise<ArchiveOrderResponse> {
    // Clear cache on create
    this.cache.clear();
    return this.request<ArchiveOrderResponse>('POST', '/order-archive', params);
  }

  /**
   * Create Tasking Order - POST /order-tasking
   */
  async createTaskingOrder(params: TaskingOrderRequest): Promise<TaskingOrderResponse> {
    // Clear cache on create
    this.cache.clear();
    return this.request<TaskingOrderResponse>('POST', '/order-tasking', params);
  }

  /**
   * Create Order (legacy support - determines type automatically)
   */
  async createOrder(params: OrderParams): Promise<Order> {
    // Clear cache on create
    this.cache.clear();
    
    // If archiveId is provided, create archive order
    if (params.archiveId) {
      if (!params.aoi && !params.location) {
        throw new SkyFiValidationError('AOI is required for archive orders');
      }
      if (!params.deliveryDriver || !params.deliveryParams) {
        throw new SkyFiValidationError('deliveryDriver and deliveryParams are required');
      }
      
      const archiveOrder: ArchiveOrderRequest = {
        aoi: params.aoi || this.convertGeoJSONToWKT(params.location!),
        archiveId: params.archiveId,
        deliveryDriver: params.deliveryDriver,
        deliveryParams: params.deliveryParams,
        metadata: params.metadata,
        webhook_url: params.webhookUrl || params.webhook_url,
      };
      return this.createArchiveOrder(archiveOrder);
    }
    
    // Otherwise, treat as tasking order (legacy)
    throw new SkyFiValidationError('Use createTaskingOrder for tasking orders or provide archiveId for archive orders');
  }

  /**
   * Get Order Deliverable - GET /orders/{order_id}/{deliverable_type}
   * Returns redirect to signed download URL
   */
  async getOrderDeliverable(orderId: string, deliverableType: 'image' | 'payload'): Promise<string> {
    const response = await this.axios.request({
      method: 'GET',
      url: `/orders/${orderId}/${deliverableType}`,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    
    // Follow redirect to get signed URL
    if (response.status >= 300 && response.status < 400) {
      return response.headers.location || '';
    }
    
    throw new SkyFiError('No redirect URL returned for deliverable');
  }

  /**
   * Redelivery - POST /orders/{order_id}/redelivery
   */
  async redeliverOrder(orderId: string, params: OrderRedeliveryRequest): Promise<void> {
    this.cache.delete(`order:${orderId}`);
    return this.request<void>('POST', `/orders/${orderId}/redelivery`, params);
  }

  /**
   * Get Tasking by ID (legacy - use getOrder instead)
   */
  async getTasking(taskId: string): Promise<Tasking> {
    const cacheKey = `tasking:${taskId}`;
    return this.getCached(cacheKey, 60, () =>
      this.request<Tasking>('GET', `/tasking/${taskId}`)
    );
  }

  /**
   * Create Tasking (legacy - use createTaskingOrder instead)
   */
  async createTasking(params: TaskingParams): Promise<Tasking> {
    return this.request<Tasking>('POST', '/tasking', params);
  }

  /**
   * Pricing - POST /pricing
   */
  async getPricing(params: PricingRequest): Promise<PricingResponse> {
    const cacheKey = `pricing:${JSON.stringify(params)}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<PricingResponse>('POST', '/pricing', params)
    );
  }

  /**
   * Estimate Price (legacy support - converts to PricingRequest)
   */
  async estimatePrice(params: PriceEstimateParams): Promise<PriceEstimate> {
    // Convert legacy params to PricingRequest
    const pricingRequest: PricingRequest = {
      aoi: params.aoi || this.convertGeoJSONToWKT(params.location!),
    };
    
    if (params.productTypes) {
      pricingRequest.productTypes = params.productTypes;
    }
    if (params.providers) {
      pricingRequest.providers = params.providers;
    }
    if (params.startDate) {
      pricingRequest.startDate = params.startDate;
    }
    if (params.endDate) {
      pricingRequest.endDate = params.endDate;
    }
    
    const pricingResponse = await this.getPricing(pricingRequest);
    
    // Convert to legacy PriceEstimate format
    const firstProduct = pricingResponse.products?.[0];
    return {
      estimatedPrice: pricingResponse.totalEstimatedPrice || firstProduct?.pricePerSquareKm || 0,
      currency: pricingResponse.currency || firstProduct?.currency || 'USD',
      breakdown: {
        base: 0,
        area: pricingResponse.totalEstimatedPrice || 0,
        resolution: 0,
        urgency: 0,
      },
    };
  }

  /**
   * Create AOI monitoring definition
   */
  async createAoi(params: CreateAOIParams): Promise<AOI> {
    // Clear AOI cache on create
    this.cache.delete('aois:list');
    return this.request<AOI>('POST', '/monitoring/aois', params);
  }

  /**
   * List AOIs
   */
  async listAois(): Promise<AOI[]> {
    const cacheKey = 'aois:list';
    return this.getCached(cacheKey, 300, () =>
      this.request<AOI[]>('GET', '/monitoring/aois')
    );
  }

  /**
   * Update AOI definition
   */
  async updateAoi(aoiId: string, params: UpdateAOIParams): Promise<AOI> {
    this.cache.delete('aois:list');
    return this.request<AOI>('PUT', `/monitoring/aois/${aoiId}`, params);
  }

  /**
   * Delete AOI definition
   */
  async deleteAoi(aoiId: string): Promise<void> {
    this.cache.delete('aois:list');
    return this.request<void>('DELETE', `/monitoring/aois/${aoiId}`);
  }

  /**
   * Create Webhook
   */
  async createWebhook(params: WebhookParams): Promise<Webhook> {
    return this.request<Webhook>('POST', '/webhooks', params);
  }

  /**
   * Create Webhook scoped to an AOI
   */
  async createAoiWebhook(aoiId: string, params: WebhookParams): Promise<Webhook> {
    this.cache.delete('webhooks:list');
    return this.request<Webhook>('POST', `/monitoring/aois/${aoiId}/webhooks`, {
      ...params,
      aoiId,
    });
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
   * Health & Auth Endpoints
   */

  /**
   * Ping - GET /ping
   */
  async ping(): Promise<PingResponse> {
    return this.request<PingResponse>('GET', '/ping');
  }

  /**
   * Health Check - GET /health_check
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    return this.request<HealthCheckResponse>('GET', '/health_check');
  }

  /**
   * Whoami - GET /auth/whoami
   */
  async whoami(): Promise<WhoamiUser> {
    return this.request<WhoamiUser>('GET', '/auth/whoami');
  }

  /**
   * Demo Delivery - POST /demo-delivery
   */
  async demoDelivery(params: DemoDeliveryRequest): Promise<DemoDeliveryResponse> {
    return this.request<DemoDeliveryResponse>('POST', '/demo-delivery', params);
  }

  /**
   * Feasibility Endpoints
   */

  /**
   * Create Feasibility Task - POST /feasibility
   */
  async createFeasibilityTask(params: PlatformApiFeasibilityTaskRequest): Promise<PlatformFeasibilityTaskResponse> {
    return this.request<PlatformFeasibilityTaskResponse>('POST', '/feasibility', params);
  }

  /**
   * Get Feasibility Task - GET /feasibility/{feasibility_id}
   */
  async getFeasibilityTask(feasibilityId: string): Promise<PlatformFeasibilityTaskResponse | null> {
    const cacheKey = `feasibility:${feasibilityId}`;
    return this.getCached(cacheKey, 30, () =>
      this.request<PlatformFeasibilityTaskResponse | null>('GET', `/feasibility/${feasibilityId}`)
    );
  }

  /**
   * Pass Prediction - POST /feasibility/pass-prediction
   */
  async getPassPrediction(params: PlatformApiPassPredictionRequest): Promise<PlatformPassPredictionResponse> {
    const cacheKey = `pass-prediction:${JSON.stringify(params)}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<PlatformPassPredictionResponse>('POST', '/feasibility/pass-prediction', params)
    );
  }

  /**
   * Notifications Endpoints
   */

  /**
   * Create Notification - POST /notifications
   */
  async createNotification(params: CreateNotificationRequest): Promise<NotificationResponse> {
    this.cache.delete('notifications:list');
    return this.request<NotificationResponse>('POST', '/notifications', params);
  }

  /**
   * List Notifications - GET /notifications
   */
  async listNotifications(params?: ListNotificationsRequest): Promise<ListNotificationsResponse> {
    const cacheKey = `notifications:${JSON.stringify(params)}`;
    const queryParams = new URLSearchParams();
    if (params?.pageNumber !== undefined) queryParams.append('pageNumber', String(params.pageNumber));
    if (params?.pageSize) queryParams.append('pageSize', String(params.pageSize));
    
    const queryString = queryParams.toString();
    const endpoint = queryString ? `/notifications?${queryString}` : '/notifications';
    
    return this.getCached(cacheKey, 300, () =>
      this.request<ListNotificationsResponse>('GET', endpoint)
    );
  }

  /**
   * Get Notification - GET /notifications/{notification_id}
   */
  async getNotification(notificationId: string): Promise<NotificationWithHistoryResponse> {
    const cacheKey = `notification:${notificationId}`;
    return this.getCached(cacheKey, 300, () =>
      this.request<NotificationWithHistoryResponse>('GET', `/notifications/${notificationId}`)
    );
  }

  /**
   * Delete Notification - DELETE /notifications/{notification_id}
   */
  async deleteNotification(notificationId: string): Promise<void> {
    this.cache.delete('notifications:list');
    this.cache.delete(`notification:${notificationId}`);
    return this.request<void>('DELETE', `/notifications/${notificationId}`);
  }

  /**
   * Utility Methods
   */

  /**
   * Convert GeoJSON to WKT Polygon (simple conversion)
   * Note: This is a basic implementation. For production, use a proper GeoJSON to WKT library.
   */
  private convertGeoJSONToWKT(geoJson: GeoJSON): string {
    if (!geoJson || !geoJson.coordinates) {
      throw new SkyFiValidationError('Invalid GeoJSON: coordinates required');
    }

    // Handle Polygon coordinates: [[[lon, lat], [lon, lat], ...]]
    if (geoJson.type === 'Polygon' && Array.isArray(geoJson.coordinates)) {
      const rings = geoJson.coordinates[0]; // First ring (exterior)
      if (Array.isArray(rings) && rings.length > 0) {
        const points = rings.map((coord: any) => {
          if (Array.isArray(coord) && coord.length >= 2) {
            return `${coord[0]} ${coord[1]}`;
          }
          throw new SkyFiValidationError('Invalid coordinate format');
        }).join(', ');
        return `POLYGON ((${points}))`;
      }
    }

    // Handle Point coordinates: [lon, lat]
    if (geoJson.type === 'Point' && Array.isArray(geoJson.coordinates) && geoJson.coordinates.length >= 2) {
      const coords = geoJson.coordinates as number[];
      const lon = coords[0];
      const lat = coords[1];
      // Convert point to small square polygon (approximation)
      const size = 0.01; // ~1km at equator
      return `POLYGON ((${lon - size} ${lat - size}, ${lon + size} ${lat - size}, ${lon + size} ${lat + size}, ${lon - size} ${lat + size}, ${lon - size} ${lat - size}))`;
    }

    throw new SkyFiValidationError(`Unsupported GeoJSON type: ${geoJson.type}. Only Polygon and Point are supported.`);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  // FALLBACK SYSTEM DISABLED
  // All fallback methods have been removed per user request
  // Real API errors will now be thrown instead of using mock data
}

// Singleton instance
export const skyfiClient = new SkyFiClient();
