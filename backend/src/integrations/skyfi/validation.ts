/**
 * Input validation for SkyFi API parameters
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate GeoJSON coordinates
 */
export function validateGeoJSON(geojson: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!geojson) {
    errors.push('GeoJSON is required');
    return { valid: false, errors, warnings };
  }

  if (!geojson.type) {
    errors.push('GeoJSON type is required');
  }

  if (!geojson.coordinates) {
    errors.push('GeoJSON coordinates are required');
  }

  // Validate Point
  if (geojson.type === 'Point') {
    if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length !== 2) {
      errors.push('Point coordinates must be [longitude, latitude]');
    } else {
      const [lon, lat] = geojson.coordinates;
      if (typeof lon !== 'number' || typeof lat !== 'number') {
        errors.push('Coordinates must be numbers');
      }
      if (lon < -180 || lon > 180) {
        errors.push('Longitude must be between -180 and 180');
      }
      if (lat < -90 || lat > 90) {
        errors.push('Latitude must be between -90 and 90');
      }
    }
  }

  // Validate Polygon
  if (geojson.type === 'Polygon') {
    if (!Array.isArray(geojson.coordinates) || geojson.coordinates.length === 0) {
      errors.push('Polygon must have at least one ring');
    } else {
      geojson.coordinates.forEach((ring: any, idx: number) => {
        if (!Array.isArray(ring) || ring.length < 4) {
          errors.push(`Ring ${idx} must have at least 4 points (first and last must match)`);
        } else {
          // Check if ring is closed
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (!Array.isArray(first) || !Array.isArray(last)) {
            errors.push(`Ring ${idx} points must be coordinate arrays`);
          } else if (first[0] !== last[0] || first[1] !== last[1]) {
            warnings.push(`Ring ${idx} may not be closed (first and last points don't match)`);
          }

          // Validate each coordinate
          ring.forEach((coord: any, coordIdx: number) => {
            if (!Array.isArray(coord) || coord.length !== 2) {
              errors.push(`Ring ${idx}, coordinate ${coordIdx} must be [longitude, latitude]`);
            } else {
              const [lon, lat] = coord;
              if (typeof lon !== 'number' || typeof lat !== 'number') {
                errors.push(`Ring ${idx}, coordinate ${coordIdx} must be numbers`);
              }
              if (lon < -180 || lon > 180) {
                errors.push(`Ring ${idx}, coordinate ${coordIdx} longitude out of range`);
              }
              if (lat < -90 || lat > 90) {
                errors.push(`Ring ${idx}, coordinate ${coordIdx} latitude out of range`);
              }
            }
          });
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate date range
 */
export function validateDateRange(startDate?: string, endDate?: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      errors.push('Invalid start date format. Use ISO 8601 (YYYY-MM-DD)');
    } else {
      const now = new Date();
      if (start < new Date('1980-01-01')) {
        warnings.push('Start date is before satellite era (pre-1980)');
      }
      if (start > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
        warnings.push('Start date is more than 1 year in the future');
      }
    }
  }

  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      errors.push('Invalid end date format. Use ISO 8601 (YYYY-MM-DD)');
    } else {
      const now = new Date();
      if (end > new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000)) {
        warnings.push('End date is more than 2 years in the future');
      }
    }
  }

  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      errors.push('Start date must be before end date');
    }
    const daysDiff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (daysDiff > 365 * 2) {
      warnings.push('Date range spans more than 2 years, results may be extensive');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate cloud coverage percentage
 */
export function validateCloudCoverage(cloudCover?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (cloudCover !== undefined) {
    if (typeof cloudCover !== 'number') {
      errors.push('Cloud coverage must be a number');
    } else if (cloudCover < 0 || cloudCover > 100) {
      errors.push('Cloud coverage must be between 0 and 100');
    } else if (cloudCover < 10) {
      warnings.push('Very low cloud coverage threshold may limit results');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate resolution
 */
export function validateResolution(resolution?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (resolution !== undefined) {
    if (typeof resolution !== 'number') {
      errors.push('Resolution must be a number');
    } else if (resolution <= 0) {
      errors.push('Resolution must be positive');
    } else if (resolution > 1000) {
      warnings.push('Very low resolution (>1000m) requested');
    } else if (resolution < 0.3) {
      warnings.push('Very high resolution (<0.3m) may be expensive and limited availability');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate area size
 */
export function validateAreaSize(areaKm2?: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (areaKm2 !== undefined) {
    if (typeof areaKm2 !== 'number') {
      errors.push('Area must be a number');
    } else if (areaKm2 <= 0) {
      errors.push('Area must be positive');
    } else if (areaKm2 > 10000) {
      warnings.push('Very large area (>10,000 km²) may be expensive');
    } else if (areaKm2 < 0.01) {
      warnings.push('Very small area (<0.01 km²) may have minimum order requirements');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate webhook URL
 */
export function validateWebhookURL(url?: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') {
        errors.push('Webhook URL must use HTTPS protocol');
      }
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        errors.push('Webhook URL must be publicly accessible (not localhost)');
      }
    } catch (e) {
      errors.push('Invalid webhook URL format');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate archive search parameters
 */
export function validateArchiveSearchParams(params: any): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Validate location or AOI
  if (!params.location && !params.aoi) {
    allWarnings.push('No location or AOI specified - results may be too broad');
  }

  if (params.location) {
    const locResult = validateGeoJSON(params.location);
    allErrors.push(...locResult.errors);
    allWarnings.push(...locResult.warnings);
  }

  if (params.aoi) {
    const aoiResult = validateGeoJSON(params.aoi);
    allErrors.push(...aoiResult.errors);
    allWarnings.push(...aoiResult.warnings);
  }

  // Validate date range
  const dateResult = validateDateRange(params.startDate, params.endDate);
  allErrors.push(...dateResult.errors);
  allWarnings.push(...dateResult.warnings);

  // Validate cloud coverage
  const cloudResult = validateCloudCoverage(params.maxCloudCoverage || params.maxCloudCover);
  allErrors.push(...cloudResult.errors);
  allWarnings.push(...cloudResult.warnings);

  // Validate resolution
  const resResult = validateResolution(params.minResolution || params.resolution);
  allErrors.push(...resResult.errors);
  allWarnings.push(...resResult.warnings);

  // Validate limit
  if (params.limit !== undefined) {
    if (typeof params.limit !== 'number' || params.limit <= 0) {
      allErrors.push('Limit must be a positive number');
    } else if (params.limit > 100) {
      allWarnings.push('Large limit (>100) may slow down response');
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate tasking parameters
 */
export function validateTaskingParams(params: any): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Location is required for tasking
  if (!params.location && !params.aoi) {
    allErrors.push('Location or AOI is required for tasking');
  }

  if (params.location) {
    const locResult = validateGeoJSON(params.location);
    allErrors.push(...locResult.errors);
    allWarnings.push(...locResult.warnings);
  }

  if (params.aoi) {
    const aoiResult = validateGeoJSON(params.aoi);
    allErrors.push(...aoiResult.errors);
    allWarnings.push(...aoiResult.warnings);
  }

  // Validate date range (required for tasking)
  if (!params.startDate || !params.endDate) {
    allErrors.push('Start date and end date are required for tasking');
  } else {
    const dateResult = validateDateRange(params.startDate, params.endDate);
    allErrors.push(...dateResult.errors);
    allWarnings.push(...dateResult.warnings);

    // Check if dates are in the future
    const start = new Date(params.startDate);
    const now = new Date();
    if (start < now) {
      allErrors.push('Tasking start date must be in the future');
    }
  }

  // Validate cloud coverage
  const cloudResult = validateCloudCoverage(params.maxCloudCoverage || params.maxCloudCover);
  allErrors.push(...cloudResult.errors);
  allWarnings.push(...cloudResult.warnings);

  // Validate resolution
  const resResult = validateResolution(params.resolution);
  allErrors.push(...resResult.errors);
  allWarnings.push(...resResult.warnings);

  // Validate priority
  if (params.priority) {
    const validPriorities = ['standard', 'rush', 'urgent'];
    if (!validPriorities.includes(params.priority)) {
      allErrors.push(`Priority must be one of: ${validPriorities.join(', ')}`);
    }
    if (params.priority === 'urgent') {
      allWarnings.push('Urgent priority significantly increases cost');
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate AOI monitoring parameters
 */
export function validateAOIParams(params: any): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Name is required
  if (!params.name || typeof params.name !== 'string') {
    allErrors.push('AOI name is required');
  } else if (params.name.length < 3) {
    allWarnings.push('AOI name should be at least 3 characters');
  }

  // Geometry is required
  if (!params.geometry) {
    allErrors.push('AOI geometry is required');
  } else {
    const geoResult = validateGeoJSON(params.geometry);
    allErrors.push(...geoResult.errors);
    allWarnings.push(...geoResult.warnings);
  }

  // Validate webhook if provided
  if (params.webhookUrl) {
    const webhookResult = validateWebhookURL(params.webhookUrl);
    allErrors.push(...webhookResult.errors);
    allWarnings.push(...webhookResult.warnings);
  }

  // Validate criteria
  if (params.maxCloudCover !== undefined) {
    const cloudResult = validateCloudCoverage(params.maxCloudCover);
    allErrors.push(...cloudResult.errors);
    allWarnings.push(...cloudResult.warnings);
  }

  if (params.minResolution !== undefined) {
    const resResult = validateResolution(params.minResolution);
    allErrors.push(...resResult.errors);
    allWarnings.push(...resResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}

/**
 * Validate webhook parameters
 */
export function validateWebhookParams(params: any): ValidationResult {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // URL is required
  if (!params.url) {
    allErrors.push('Webhook URL is required');
  } else {
    const urlResult = validateWebhookURL(params.url);
    allErrors.push(...urlResult.errors);
    allWarnings.push(...urlResult.warnings);
  }

  // Events are required
  if (!params.events || !Array.isArray(params.events) || params.events.length === 0) {
    allErrors.push('At least one event must be specified');
  } else {
    const validEvents = [
      'order.created',
      'order.processing',
      'order.completed',
      'order.failed',
      'tasking.scheduled',
      'tasking.captured',
      'tasking.failed',
      'imagery.available',
      'aoi.data.available',
      'aoi.capture.scheduled',
      'aoi.capture.completed',
    ];

    params.events.forEach((event: string) => {
      if (!validEvents.includes(event)) {
        allErrors.push(`Invalid event: ${event}. Valid events: ${validEvents.join(', ')}`);
      }
    });
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}


