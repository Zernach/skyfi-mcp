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

// Archive Search
export interface ArchiveSearchParams {
  location: GeoJSON;
  dateRange?: DateRange;
  maxCloudCover?: number;
  satellites?: string[];
  resolution?: Resolution;
  limit?: number;
  offset?: number;
}

export interface ArchiveSearchResult {
  id: string;
  satellite: string;
  captureDate: string;
  cloudCover: number;
  resolution: number;
  thumbnail: string;
  bbox: number[];
  price: number;
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
}

// Pricing
export interface PriceEstimateParams {
  location: GeoJSON;
  satellite?: string;
  resolution?: number;
  deliveryFormat?: string;
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
}

// Webhooks
export interface WebhookParams {
  url: string;
  events: string[];
  secret?: string;
  metadata?: Record<string, any>;
}

export interface Webhook {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  lastTriggered?: string;
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
