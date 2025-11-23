import {
  validateGeoJSON,
  validateDateRange,
  validateCloudCoverage,
  validateResolution,
  validateAreaSize,
  validateWebhookURL,
  validateArchiveSearchParams,
  validateTaskingParams,
  validateAOIParams,
  validateWebhookParams,
} from '../src/integrations/skyfi/validation';

describe('SkyFi Validation Functions', () => {
  describe('validateGeoJSON', () => {
    it('should validate a correct Point geometry', () => {
      const geojson = {
        type: 'Point',
        coordinates: [-122.4194, 37.7749],
      };

      const result = validateGeoJSON(geojson);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a correct Polygon geometry', () => {
      const geojson = {
        type: 'Polygon',
        coordinates: [
          [
            [-122.5, 37.7],
            [-122.3, 37.7],
            [-122.3, 37.8],
            [-122.5, 37.8],
            [-122.5, 37.7], // Closed ring
          ],
        ],
      };

      const result = validateGeoJSON(geojson);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid longitude', () => {
      const geojson = {
        type: 'Point',
        coordinates: [-200, 37.7749], // Invalid longitude
      };

      const result = validateGeoJSON(geojson);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Longitude must be between -180 and 180');
    });

    it('should detect invalid latitude', () => {
      const geojson = {
        type: 'Point',
        coordinates: [-122.4194, 100], // Invalid latitude
      };

      const result = validateGeoJSON(geojson);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Latitude must be between -90 and 90');
    });

    it('should detect missing coordinates', () => {
      const geojson = {
        type: 'Point',
      };

      const result = validateGeoJSON(geojson);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('GeoJSON coordinates are required');
    });

    it('should warn about unclosed polygon ring', () => {
      const geojson = {
        type: 'Polygon',
        coordinates: [
          [
            [-122.5, 37.7],
            [-122.3, 37.7],
            [-122.3, 37.8],
            [-122.5, 37.8],
            [-122.4, 37.7], // Not closed properly
          ],
        ],
      };

      const result = validateGeoJSON(geojson);

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("may not be closed");
    });
  });

  describe('validateDateRange', () => {
    it('should validate a correct date range', () => {
      const result = validateDateRange('2023-01-01', '2023-12-31');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid start date format', () => {
      const result = validateDateRange('invalid-date', '2023-12-31');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid start date format. Use ISO 8601 (YYYY-MM-DD)');
    });

    it('should detect invalid end date format', () => {
      const result = validateDateRange('2023-01-01', 'not-a-date');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid end date format. Use ISO 8601 (YYYY-MM-DD)');
    });

    it('should detect start date after end date', () => {
      const result = validateDateRange('2023-12-31', '2023-01-01');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start date must be before end date');
    });

    it('should warn about dates before satellite era', () => {
      const result = validateDateRange('1970-01-01', '1970-12-31');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Start date is before satellite era (pre-1980)');
    });

    it('should warn about very long date ranges', () => {
      const result = validateDateRange('2020-01-01', '2025-12-31');

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Date range spans more than 2 years, results may be extensive');
    });

    it('should accept single date (start only)', () => {
      const result = validateDateRange('2023-06-15', undefined);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateCloudCoverage', () => {
    it('should validate correct cloud coverage', () => {
      const result = validateCloudCoverage(20);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect negative cloud coverage', () => {
      const result = validateCloudCoverage(-5);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cloud coverage must be between 0 and 100');
    });

    it('should detect cloud coverage over 100', () => {
      const result = validateCloudCoverage(150);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cloud coverage must be between 0 and 100');
    });

    it('should warn about very low cloud coverage', () => {
      const result = validateCloudCoverage(5);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Very low cloud coverage threshold may limit results');
    });

    it('should accept undefined cloud coverage', () => {
      const result = validateCloudCoverage(undefined);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateResolution', () => {
    it('should validate correct resolution', () => {
      const result = validateResolution(10);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect negative resolution', () => {
      const result = validateResolution(-1);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Resolution must be positive');
    });

    it('should detect zero resolution', () => {
      const result = validateResolution(0);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Resolution must be positive');
    });

    it('should warn about very low resolution', () => {
      const result = validateResolution(1500);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Very low resolution (>1000m) requested');
    });

    it('should warn about very high resolution', () => {
      const result = validateResolution(0.2);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Very high resolution (<0.3m) may be expensive and limited availability');
    });
  });

  describe('validateAreaSize', () => {
    it('should validate correct area size', () => {
      const result = validateAreaSize(100);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect negative area', () => {
      const result = validateAreaSize(-10);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Area must be positive');
    });

    it('should detect zero area', () => {
      const result = validateAreaSize(0);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Area must be positive');
    });

    it('should warn about very large area', () => {
      const result = validateAreaSize(15000);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Very large area (>10,000 km²) may be expensive');
    });

    it('should warn about very small area', () => {
      const result = validateAreaSize(0.005);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Very small area (<0.01 km²) may have minimum order requirements');
    });
  });

  describe('validateWebhookURL', () => {
    it('should validate correct HTTPS URL', () => {
      const result = validateWebhookURL('https://example.com/webhook');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject HTTP URL', () => {
      const result = validateWebhookURL('http://example.com/webhook');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Webhook URL must use HTTPS protocol');
    });

    it('should reject localhost URL', () => {
      const result = validateWebhookURL('https://localhost:3000/webhook');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Webhook URL must be publicly accessible (not localhost)');
    });

    it('should reject 127.0.0.1 URL', () => {
      const result = validateWebhookURL('https://127.0.0.1/webhook');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Webhook URL must be publicly accessible (not localhost)');
    });

    it('should reject invalid URL format', () => {
      const result = validateWebhookURL('not-a-url');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid webhook URL format');
    });
  });

  describe('validateArchiveSearchParams', () => {
    it('should validate correct archive search params', () => {
      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        maxCloudCover: 20,
        minResolution: 10,
        limit: 10,
      };

      const result = validateArchiveSearchParams(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn about missing location and AOI', () => {
      const params = {
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      };

      const result = validateArchiveSearchParams(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('No location or AOI specified - results may be too broad');
    });

    it('should detect invalid limit', () => {
      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        limit: -5,
      };

      const result = validateArchiveSearchParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Limit must be a positive number');
    });

    it('should warn about large limit', () => {
      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        limit: 150,
      };

      const result = validateArchiveSearchParams(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Large limit (>100) may slow down response');
    });
  });

  describe('validateTaskingParams', () => {
    it('should validate correct tasking params', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const params = {
        location: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 37.8],
              [-122.5, 37.8],
              [-122.5, 37.7],
            ],
          ],
        },
        startDate: futureDate.toISOString().split('T')[0],
        endDate: new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        resolution: 0.5,
        maxCloudCover: 10,
        priority: 'standard',
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require location or AOI', () => {
      const params = {
        startDate: '2024-01-01',
        endDate: '2024-01-07',
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Location or AOI is required for tasking');
    });

    it('should require start and end date', () => {
      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Start date and end date are required for tasking');
    });

    it('should reject past start date', () => {
      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: '2020-01-01',
        endDate: '2020-01-07',
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Tasking start date must be in the future');
    });

    it('should detect invalid priority', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: futureDate.toISOString().split('T')[0],
        endDate: new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        priority: 'super-urgent',
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Priority must be one of:');
    });

    it('should warn about urgent priority cost', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);

      const params = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: futureDate.toISOString().split('T')[0],
        endDate: new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        priority: 'urgent',
      };

      const result = validateTaskingParams(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('Urgent priority significantly increases cost');
    });
  });

  describe('validateAOIParams', () => {
    it('should validate correct AOI params', () => {
      const params = {
        name: 'San Francisco Bay',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 37.9],
              [-122.5, 37.9],
              [-122.5, 37.7],
            ],
          ],
        },
        maxCloudCover: 15,
        minResolution: 10,
        webhookUrl: 'https://example.com/webhook',
      };

      const result = validateAOIParams(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require AOI name', () => {
      const params = {
        geometry: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const result = validateAOIParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('AOI name is required');
    });

    it('should require AOI geometry', () => {
      const params = {
        name: 'Test AOI',
      };

      const result = validateAOIParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('AOI geometry is required');
    });

    it('should warn about short AOI name', () => {
      const params = {
        name: 'AB',
        geometry: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const result = validateAOIParams(params);

      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('AOI name should be at least 3 characters');
    });
  });

  describe('validateWebhookParams', () => {
    it('should validate correct webhook params', () => {
      const params = {
        url: 'https://example.com/webhook',
        events: ['order.completed', 'order.failed'],
      };

      const result = validateWebhookParams(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should require webhook URL', () => {
      const params = {
        events: ['order.completed'],
      };

      const result = validateWebhookParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Webhook URL is required');
    });

    it('should require at least one event', () => {
      const params = {
        url: 'https://example.com/webhook',
        events: [],
      };

      const result = validateWebhookParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one event must be specified');
    });

    it('should detect invalid event names', () => {
      const params = {
        url: 'https://example.com/webhook',
        events: ['invalid.event', 'order.completed'],
      };

      const result = validateWebhookParams(params);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid event: invalid.event');
    });

    it('should validate all valid event types', () => {
      const params = {
        url: 'https://example.com/webhook',
        events: [
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
        ],
      };

      const result = validateWebhookParams(params);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});


