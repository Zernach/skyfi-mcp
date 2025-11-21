/**
 * SkyFi API Type Definitions
 */

export interface GeoJSON {
  type: string;
  coordinates: number[] | number[][] | number[][][];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface Resolution {
  min?: number;
  max?: number;
}

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

// Archive Search
export interface ArchiveSearchParams {
  location?: GeoJSON;
  aoi?: GeoJSON;
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

export interface ArchiveSearchResult {
  id: string;
  satellite: string;
  captureDate: string;
  cloudCover: number;
  resolution: number;
  thumbnail?: string;
  bbox?: number[];
  price?: number;
  metadata?: Record<string, any>;
}

export interface ArchiveSearchResponse {
  results: ArchiveSearchResult[];
  total: number;
  limit: number;
  offset: number;
}

// Orders
export interface OrderFilters {
  status?: string;
  dateRange?: DateRange;
  limit?: number;
  offset?: number;
}

export interface OrderParams {
  archiveId?: string;
  taskingId?: string;
  location?: GeoJSON;
  deliveryFormat?: string;
  notifyUrl?: string;
  webhookUrl?: string;
  metadata?: Record<string, any>;
}

export interface Order {
  id: string;
  status: string;
  location: GeoJSON;
  price: number;
  createdAt: string;
  updatedAt: string;
  deliveryUrl?: string;
  metadata?: Record<string, any>;
}

// Tasking
export interface TaskingParams {
  location: GeoJSON;
  captureWindow: DateRange;
  satellite?: string;
  resolution?: number;
  priority?: string;
}

export interface Tasking {
  id: string;
  status: string;
  location: GeoJSON;
  captureWindow: DateRange;
  estimatedCost: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

// Pricing
export type PriceEstimateType = 'archive' | 'tasking';

export type ProcessingLevel = 'raw' | 'orthorectified' | 'pansharpened';

export type PriorityLevel = 'standard' | 'rush' | 'urgent';

export interface PriceEstimateParams {
  type: PriceEstimateType;
  areaKm2: number;
  resolution?: number;
  processingLevel?: ProcessingLevel;
  priority?: PriorityLevel;
  location?: GeoJSON;
  aoi?: GeoJSON;
  startDate?: string;
  endDate?: string;
  satellites?: string[];
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

// AOI Monitoring
export interface CreateAOIParams {
  name: string;
  geometry: GeoJSON;
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

// API Response
export interface SkyFiAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}
