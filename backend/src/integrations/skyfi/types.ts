/**
 * SkyFi API Type Definitions
 * Based on official SkyFi Platform API documentation
 * Base URL: https://app.skyfi.com/platform-api
 */

export interface GeoJSON {
  type: string;
  coordinates: number[] | number[][] | number[][][];
}

// WKT (Well-Known Text) polygon format for AOI
export type WKTPolygon = string; // e.g., "POLYGON ((lon1 lat1, lon2 lat2, ..., lonN latN))"

export interface DateRange {
  start: string;
  end: string;
}

export interface Resolution {
  min?: number;
  max?: number;
}

// SkyFi API Provider enum
export type ApiProvider = 
  | 'SIWEI' 
  | 'SATELLOGIC' 
  | 'UMBRA' 
  | 'PLANET' 
  | 'SENTINEL2' 
  | 'SENTINEL2_CREODIAS'
  | string;

// Legacy resolution enum
export type LegacyResolution = 
  | 'LOW' 
  | 'MEDIUM' 
  | 'HIGH' 
  | 'VERY HIGH' 
  | 'SUPER HIGH' 
  | 'ULTRA HIGH' 
  | 'CM 30' 
  | 'CM 50';

// Product types
export type ProductType = 'DAY' | 'MULTISPECTRAL' | 'SAR';

// Order types
export type OrderType = 'ARCHIVE' | 'TASKING';

// Delivery drivers
export type DeliveryDriver = 'S3' | 'GS' | 'AZURE';

export interface MonitoringSchedule {
  frequency?: string;
  startDate?: string;
  endDate?: string;
  timeOfDay?: string;
  timezone?: string;
  metadata?: Record<string, any>;
}

export interface MonitoringCriteria {
  maxCloudCover?: number;
  minResolution?: number;
  events?: string[];
  filters?: Record<string, any>;
  metadata?: Record<string, any>;
}

// Archive Search - matches GetArchivesRequestBase
export interface ArchiveSearchParams {
  aoi: WKTPolygon; // Required: WKT polygon
  fromDate?: string; // ISO 8601 datetime: YYYY-MM-DDTHH:MM:SS+00:00
  toDate?: string; // ISO 8601 datetime
  maxCloudCoveragePercent?: number; // 0-100
  maxOffNadirAngle?: number; // 0-50 degrees
  resolutions?: LegacyResolution[]; // Array of resolution enums
  productTypes?: ProductType[]; // e.g., ["DAY","MULTISPECTRAL"]
  providers?: ApiProvider[]; // e.g., ["SATELLOGIC","SENTINEL2_CREODIAS"]
  openData?: boolean; // When true, only open-data catalog entries
  minOverlapRatio?: number; // 0-1, based on overlap between AOI and image
  pageSize?: number; // Up to 100
  page?: string; // nextPage token from previous response (for pagination)
  // Legacy support
  location?: GeoJSON;
  dateRange?: DateRange;
  maxCloudCover?: number;
  satellites?: string[];
  resolution?: Resolution;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  maxCloudCoverage?: number;
  minResolution?: number;
}

// ArchiveResponse - matches official API schema
export interface ArchiveResponse {
  archiveId: string; // UUID
  provider: ApiProvider;
  constellation?: string;
  productType: ProductType;
  platformResolution?: string;
  resolution?: LegacyResolution;
  gsd?: number; // Ground sampling distance in meters or centimeters
  captureTimestamp: string; // ISO 8601
  cloudCoveragePercent?: number;
  offNadirAngle?: number;
  footprint: WKTPolygon; // WKT polygon
  minSquareKms?: number;
  maxSquareKms?: number;
  priceForOneSquareKm: number; // 0 for open data
  totalAreaSquareKm?: number;
  deliveryTimeHours?: number;
  thumbnailUrls?: Record<string, string>; // Map of thumbnail URLs
  metadata?: Record<string, any>;
}

// GetArchivesResponse - matches official API response
export interface ArchiveSearchResponse {
  request: ArchiveSearchParams; // Echo of request
  archives: ArchiveResponse[]; // List of archive results
  nextPage?: string; // Opaque token for pagination
  total?: number; // Deprecated total count
  // Legacy support
  results?: ArchiveResponse[];
  limit?: number;
  offset?: number;
}

// Orders - matches official API
export interface OrderFilters {
  orderType?: OrderType; // 'ARCHIVE' or 'TASKING'
  pageNumber?: number; // Default 0
  pageSize?: number; // 1-25
  // Legacy support
  status?: string;
  dateRange?: DateRange;
  limit?: number;
  offset?: number;
}

// Delivery parameters for S3
export interface S3DeliveryParams {
  s3_bucket_id: string;
  aws_region: string;
  aws_access_key: string;
  aws_secret_key: string;
  subfolder?: string;
}

// Delivery parameters for Google Cloud Storage
export interface GCSDeliveryParams {
  gs_project_id: string;
  gs_bucket_id: string;
  gs_credentials: string; // Service account JSON
  subfolder?: string;
}

// Delivery parameters for Azure
export interface AzureDeliveryParams {
  // Option 1: Connection string
  azure_connection_string?: string;
  azure_container_name: string;
  // Option 2: Service principal
  azure_account_name?: string;
  azure_tenant_id?: string;
  azure_client_id?: string;
  azure_client_secret?: string;
  subfolder?: string;
}

export type DeliveryParams = S3DeliveryParams | GCSDeliveryParams | AzureDeliveryParams;

// Archive Order Request
export interface ArchiveOrderRequest {
  aoi: WKTPolygon; // Should be inside archive footprint
  archiveId: string; // From GET /archives
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
  metadata?: Record<string, any>;
  webhook_url?: string;
}

// Tasking Order Request
export interface TaskingOrderRequest {
  aoi: WKTPolygon;
  window_start: string; // ISO 8601 datetime
  window_end: string; // ISO 8601 datetime
  product_type: ProductType; // DAY, MULTISPECTRAL, SAR, etc.
  resolution: LegacyResolution;
  max_cloud_coverage_percent?: number;
  max_off_nadir_angle?: number;
  required_provider?: ApiProvider; // e.g., PLANET or UMBRA
  provider_window_id?: string; // For Planet pass selection
  sar_product_types?: string[]; // SAR-specific
  sar_parameters?: Record<string, any>; // SAR-specific
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
  priority_item?: boolean; // Expedite order
  metadata?: Record<string, any>;
  webhook_url?: string;
}

// Order Response (base)
export interface OrderBase {
  id: string;
  orderType: OrderType;
  status: string;
  aoi: WKTPolygon;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// Archive Order Response
export interface ArchiveOrderResponse extends OrderBase {
  orderType: 'ARCHIVE';
  archiveId: string;
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
}

// Tasking Order Response
export interface TaskingOrderResponse extends OrderBase {
  orderType: 'TASKING';
  window_start: string;
  window_end: string;
  product_type: ProductType;
  resolution: LegacyResolution;
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
}

export type Order = ArchiveOrderResponse | TaskingOrderResponse;

// Order Info with Events
export interface OrderEvent {
  status: string;
  timestamp: string;
  message?: string;
}

export interface OrderInfoTypesResponse {
  order: Order;
  events: OrderEvent[];
}

// Order Redelivery Request
export interface OrderRedeliveryRequest {
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
}

// Legacy OrderParams for backward compatibility
export interface OrderParams {
  archiveId?: string;
  taskingId?: string;
  location?: GeoJSON;
  aoi?: WKTPolygon;
  deliveryFormat?: string;
  deliveryDriver?: DeliveryDriver;
  deliveryParams?: DeliveryParams;
  notifyUrl?: string;
  webhookUrl?: string;
  webhook_url?: string;
  metadata?: Record<string, any>;
}

// Tasking - legacy support (use TaskingOrderRequest instead)
export interface TaskingParams {
  location: GeoJSON;
  aoi?: WKTPolygon;
  captureWindow: DateRange;
  window_start?: string;
  window_end?: string;
  satellite?: string;
  resolution?: number;
  priority?: string;
  product_type?: ProductType;
  deliveryDriver?: DeliveryDriver;
  deliveryParams?: DeliveryParams;
}

export interface Tasking {
  id: string;
  status: string;
  location: GeoJSON;
  aoi?: WKTPolygon;
  captureWindow: DateRange;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// Pricing - matches POST /pricing
export interface PricingRequest {
  aoi: WKTPolygon; // Required
  productTypes?: ProductType[];
  resolutions?: LegacyResolution[];
  providers?: ApiProvider[];
  // Legacy support
  type?: 'archive' | 'tasking';
  areaKm2?: number;
  location?: GeoJSON;
  startDate?: string;
  endDate?: string;
  satellites?: string[];
}

export interface PricingProductInfo {
  productType: ProductType;
  resolution?: LegacyResolution;
  provider?: ApiProvider;
  pricePerSquareKm: number;
  currency: string;
  estimatedDeliveryHours?: number;
}

export interface PricingResponse {
  products: PricingProductInfo[];
  totalEstimatedPrice?: number;
  currency?: string;
}

// Legacy PriceEstimateParams for backward compatibility
export type PriceEstimateType = 'archive' | 'tasking';
export type ProcessingLevel = 'raw' | 'orthorectified' | 'pansharpened';
export type PriorityLevel = 'standard' | 'rush' | 'urgent';

export interface PriceEstimateParams {
  type?: PriceEstimateType;
  areaKm2?: number;
  resolution?: number;
  processingLevel?: ProcessingLevel;
  priority?: PriorityLevel;
  location?: GeoJSON;
  aoi?: WKTPolygon;
  startDate?: string;
  endDate?: string;
  satellites?: string[];
  productTypes?: ProductType[];
  providers?: ApiProvider[];
}

export interface PriceEstimate {
  estimatedPrice: number;
  currency: string;
  breakdown: {
    base: number;
    area: number;
    resolution: number;
    urgency: number;
  };
  assumptions?: string[];
}

// Webhooks
export interface WebhookParams {
  url: string;
  events: string[];
  aoiId?: string;
  secret?: string;
  metadata?: Record<string, any>;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  aoiId?: string;
  active: boolean;
  createdAt: string;
  lastTriggered?: string;
  metadata?: Record<string, any>;
}

// Notifications - matches POST /notifications
export interface CreateNotificationRequest {
  aoi: WKTPolygon; // Required
  gsdMin?: number; // Optional min ground sampling distance
  gsdMax?: number; // Optional max ground sampling distance
  productType?: ProductType; // Optional product type filter
  webhookUrl: string; // Required webhook endpoint
  metadata?: Record<string, any>;
}

export interface NotificationResponse {
  id: string;
  ownerId?: string;
  aoi: WKTPolygon;
  gsdMin?: number;
  gsdMax?: number;
  productType?: ProductType;
  webhookUrl: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface NotificationEvent {
  timestamp: string;
  archive?: ArchiveResponse;
  message?: string;
}

export interface NotificationWithHistoryResponse extends NotificationResponse {
  history: NotificationEvent[];
}

export interface ListNotificationsRequest {
  pageNumber?: number;
  pageSize?: number; // Max 25
}

export interface ListNotificationsResponse {
  request: ListNotificationsRequest;
  total: number;
  notifications: NotificationResponse[];
}

// AOI Monitoring - legacy support (use Notifications instead)
export interface CreateAOIParams {
  name: string;
  geometry: GeoJSON;
  aoi?: WKTPolygon;
  description?: string;
  criteria?: MonitoringCriteria;
  schedule?: MonitoringSchedule;
  metadata?: Record<string, any>;
}

export interface UpdateAOIParams extends Partial<CreateAOIParams> {
  active?: boolean;
}

export interface AOI {
  id: string;
  name: string;
  geometry: GeoJSON;
  aoi?: WKTPolygon;
  description?: string;
  criteria?: MonitoringCriteria;
  schedule?: MonitoringSchedule;
  metadata?: Record<string, any>;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  skyfiAoiId?: string;
}

export interface AOIListResponse {
  aois: AOI[];
  total: number;
}

// Feasibility - matches POST /feasibility
export interface PlatformApiFeasibilityTaskRequest {
  aoi: WKTPolygon;
  productType: ProductType; // e.g., DAY, SAR
  resolution: LegacyResolution;
  startDate: string; // ISO 8601 datetime with timezone
  endDate: string; // ISO 8601 datetime with timezone
  maxCloudCoveragePercent?: number;
  priorityItem?: boolean;
  requiredProvider?: ApiProvider; // PLANET or UMBRA, etc.
  sarParameters?: Record<string, any>; // SAR-specific options
}

export interface PlatformFeasibilityTaskResponse {
  id: string; // Feasibility task ID
  status: string; // e.g., 'PENDING', 'COMPLETE', 'FAILED'
  aoi: WKTPolygon;
  productType: ProductType;
  resolution: LegacyResolution;
  startDate: string;
  endDate: string;
  createdAt: string;
  completedAt?: string;
  opportunities?: Opportunity[];
  error?: string;
}

// Pass Prediction - matches POST /feasibility/pass-prediction
export interface PlatformApiPassPredictionRequest {
  aoi: WKTPolygon;
  fromDate: string; // ISO 8601 datetime
  toDate: string; // ISO 8601 datetime
}

export interface Opportunity {
  windowStart: string; // ISO 8601 datetime
  windowEnd: string; // ISO 8601 datetime
  satelliteId?: string;
  providerWindowId?: string; // Important for Planet
  providerMetadata?: Record<string, any>;
}

export interface PlatformPassPredictionResponse {
  aoi: WKTPolygon;
  fromDate: string;
  toDate: string;
  opportunities: Opportunity[];
}

// Health & Auth endpoints
export interface PingResponse {
  message: string; // "pong"
}

export interface HealthCheckResponse {
  status: string;
}

export interface WhoamiUser {
  id: string;
  email: string;
  name?: string;
  apiKey?: string;
  isDemoAccount?: boolean;
  stats?: Record<string, any>;
}

// Demo Delivery - matches POST /demo-delivery
export interface DemoDeliveryRequest {
  deliveryDriver: DeliveryDriver;
  deliveryParams: DeliveryParams;
}

export interface DemoDeliveryResponse {
  success: boolean;
  message?: string;
  deliveryUrl?: string;
}

// API Response wrapper (may not be used by all endpoints)
export interface SkyFiAPIResponse<T> {
  success?: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
