import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { SkyFiClient } from '../src/integrations/skyfi/client';
import {
  SkyFiAuthError,
  SkyFiRateLimitError,
  SkyFiNotFoundError,
  SkyFiValidationError,
  SkyFiServerError,
  SkyFiTimeoutError,
} from '../src/integrations/skyfi/errors';
import {
  ArchiveSearchParams,
  PriceEstimateParams,
} from '../src/integrations/skyfi/types';

/**
 * Comprehensive Error Handling and Edge Case Tests for SkyFi API Client
 *
 * Test Coverage:
 * 1. Error handling for HTTP status codes (401, 404, 400, 429, 408, 500+)
 * 2. Retry logic for transient server errors and timeouts
 * 3. API key validation in request headers
 * 4. Cache functionality (caching, clearing, invalidation)
 * 5. Multiple endpoint fallbacks for archiveSearch
 * 6. Rate limiter integration
 * 7. Custom client configuration
 * 8. Edge cases (empty responses, large payloads, special characters)
 */
describe('SkyFiClient - Error Handling & Edge Cases', () => {
  let client: SkyFiClient;
  const baseUrl = 'https://api.test.skyfi.com';
  const apiKey = 'test-api-key-12345';

  beforeEach(() => {
    client = new SkyFiClient({
      apiKey,
      baseUrl,
      timeout: 5000,
      retries: 2,
    });
    nock.cleanAll();
    client.clearCache();
  });

  afterEach(() => {
    nock.cleanAll();
    client.clearCache();
  });

  describe('API Key Validation', () => {
    it('should include API key in request headers', async () => {
      let capturedHeaders: any = null;

      nock(baseUrl)
        .post('/archive/search')
        .reply(function() {
          capturedHeaders = this.req.headers;
          return [200, {
            success: true,
            data: {
              results: [],
              total: 0,
              limit: 10,
              offset: 0,
            },
          }];
        });

      await client.archiveSearch({
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      });

      expect(capturedHeaders['x-skyfi-api-key']).toBe(apiKey);
      expect(capturedHeaders['content-type']).toBe('application/json');
      expect(capturedHeaders['user-agent']).toBe('SkyFi-MCP/1.0');
    });

    it('should send custom API key when provided', async () => {
      const customKey = 'custom-key-xyz';
      const customClient = new SkyFiClient({
        apiKey: customKey,
        baseUrl,
      });

      let capturedHeaders: any = null;

      nock(baseUrl)
        .get('/orders/test-id')
        .reply(function() {
          capturedHeaders = this.req.headers;
          return [200, {
            success: true,
            data: {
              id: 'test-id',
              status: 'pending',
              location: { type: 'Point', coordinates: [0, 0] },
              price: 100,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }];
        });

      await customClient.getOrder('test-id');
      expect(capturedHeaders['x-skyfi-api-key']).toBe(customKey);
    });
  });

  describe('Error Handling - HTTP Status Codes', () => {
    it('should throw SkyFiAuthError on 401 (authentication)', async () => {
      nock(baseUrl)
        .get('/orders/test-order')
        .reply(401, {
          message: 'Invalid API key',
          code: 'UNAUTHORIZED',
        });

      await expect(client.getOrder('test-order'))
        .rejects
        .toThrow(SkyFiAuthError);
    });

    it('should throw SkyFiNotFoundError on 404', async () => {
      nock(baseUrl)
        .get('/orders/nonexistent')
        .reply(404, {
          message: 'Order not found',
          code: 'NOT_FOUND',
        });

      await expect(client.getOrder('nonexistent'))
        .rejects
        .toThrow(SkyFiNotFoundError);
    });

    it('should throw SkyFiValidationError on 400', async () => {
      nock(baseUrl)
        .post('/orders')
        .reply(400, {
          message: 'Invalid order parameters',
          code: 'VALIDATION_ERROR',
        });

      await expect(client.createOrder({ archiveId: 'invalid' }))
        .rejects
        .toThrow(SkyFiValidationError);
    });

    it('should throw SkyFiRateLimitError on 429', async () => {
      nock(baseUrl)
        .get('/orders')
        .reply(429, {
          message: 'Rate limit exceeded',
        }, {
          'retry-after': '60',
        });

      await expect(client.listOrders())
        .rejects
        .toThrow(SkyFiRateLimitError);
    });

    it('should include retry-after value in rate limit error', async () => {
      nock(baseUrl)
        .get('/webhooks')
        .reply(429, {
          message: 'Rate limited',
        }, {
          'retry-after': '120',
        });

      try {
        await client.listWebhooks();
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error).toBeInstanceOf(SkyFiRateLimitError);
        expect(error.retryAfter).toBe(120);
      }
    });

    it('should throw SkyFiTimeoutError on 408', async () => {
      nock(baseUrl)
        .post('/pricing/estimate')
        .reply(408, {
          message: 'Request timeout',
        });

      await expect(client.estimatePrice({
        type: 'archive',
        areaKm2: 100,
      })).rejects.toThrow(SkyFiTimeoutError);
    });

    it('should throw SkyFiServerError on 500', async () => {
      nock(baseUrl)
        .get('/orders/test-id')
        .reply(500, {
          message: 'Internal server error',
        });

      await expect(client.getOrder('test-id'))
        .rejects
        .toThrow(SkyFiServerError);
    });

    it('should throw SkyFiServerError on 503', async () => {
      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(503, {
          message: 'Service unavailable',
        });

      await expect(client.listAois())
        .rejects
        .toThrow(SkyFiServerError);
    });
  });

  describe('Retry Logic', () => {
    it('should retry server errors up to max retries', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .get('/orders/retry-test')
        .times(3)
        .reply(() => {
          requestCount++;
          return [500, { message: 'Server error' }];
        });

      await expect(client.getOrder('retry-test'))
        .rejects
        .toThrow(SkyFiServerError);

      expect(requestCount).toBe(3);
    });

    it('should succeed after retry on transient error', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .get('/orders/eventual-success')
        .times(2)
        .reply(() => {
          requestCount++;
          if (requestCount < 2) {
            return [500, { message: 'Server error' }];
          }
          return [200, {
            success: true,
            data: {
              id: 'eventual-success',
              status: 'completed',
              location: { type: 'Point', coordinates: [0, 0] },
              price: 100,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }];
        });

      const result = await client.getOrder('eventual-success');
      expect(result.id).toBe('eventual-success');
      expect(requestCount).toBe(2);
    });

    it('should not retry on validation errors', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .post('/monitoring/aois')
        .times(3)
        .reply(() => {
          requestCount++;
          return [400, { message: 'Invalid geometry' }];
        });

      await expect(client.createAoi({
        name: 'Test',
        geometry: { type: 'Point', coordinates: [0, 0] },
      })).rejects.toThrow(SkyFiValidationError);

      expect(requestCount).toBe(1);
    });

    it('should not retry on authentication errors', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .get('/orders/auth-test')
        .times(3)
        .reply(() => {
          requestCount++;
          return [401, { message: 'Invalid API key' }];
        });

      await expect(client.getOrder('auth-test'))
        .rejects
        .toThrow(SkyFiAuthError);

      expect(requestCount).toBe(1);
    });

    it('should not retry on 404 errors', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .delete('/monitoring/aois/nonexistent')
        .times(3)
        .reply(() => {
          requestCount++;
          return [404, { message: 'AOI not found' }];
        });

      await expect(client.deleteAoi('nonexistent'))
        .rejects
        .toThrow(SkyFiNotFoundError);

      expect(requestCount).toBe(1);
    });

    it('should use exponential backoff for retries', async () => {
      const timestamps: number[] = [];

      nock(baseUrl)
        .get('/orders/backoff-test')
        .times(3)
        .reply(() => {
          timestamps.push(Date.now());
          return [500, { message: 'Server error' }];
        });

      await expect(client.getOrder('backoff-test'))
        .rejects
        .toThrow(SkyFiServerError);

      expect(timestamps).toHaveLength(3);

      // Check backoff delays
      if (timestamps.length === 3) {
        const delay1 = timestamps[1] - timestamps[0];
        const delay2 = timestamps[2] - timestamps[1];

        // First retry after ~1000ms (2^0 * 1000)
        expect(delay1).toBeGreaterThanOrEqual(900);
        expect(delay1).toBeLessThan(1500);

        // Second retry after ~2000ms (2^1 * 1000)
        expect(delay2).toBeGreaterThanOrEqual(1900);
        expect(delay2).toBeLessThan(2500);
      }
    }, 10000);

    it('should retry timeout errors', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .post('/tasking')
        .times(3)
        .reply(() => {
          requestCount++;
          return [408, { message: 'Timeout' }];
        });

      await expect(client.createTasking({
        location: { type: 'Point', coordinates: [0, 0] },
        captureWindow: { start: '2024-02-01', end: '2024-02-15' },
      })).rejects.toThrow(SkyFiTimeoutError);

      expect(requestCount).toBe(3);
    });
  });

  describe('Cache Functionality', () => {
    it('should cache archive search results', async () => {
      const params: ArchiveSearchParams = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      let requestCount = 0;

      nock(baseUrl)
        .post('/archive/search')
        .reply(() => {
          requestCount++;
          return [200, {
            success: true,
            data: {
              results: [{
                id: 'test',
                satellite: 'Test',
                captureDate: '2024-01-01',
                cloudCover: 0,
                resolution: 10,
                price: 0,
              }],
              total: 1,
              limit: 10,
              offset: 0,
            },
          }];
        });

      await client.archiveSearch(params);
      expect(requestCount).toBe(1);

      // Second call should use cache
      await client.archiveSearch(params);
      expect(requestCount).toBe(1);
    });

    it('should cache getOrder results', async () => {
      let requestCount = 0;

      nock(baseUrl)
        .get('/orders/cached-order')
        .reply(() => {
          requestCount++;
          return [200, {
            success: true,
            data: {
              id: 'cached-order',
              status: 'completed',
              location: { type: 'Point', coordinates: [0, 0] },
              price: 100,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }];
        });

      await client.getOrder('cached-order');
      await client.getOrder('cached-order');

      expect(requestCount).toBe(1);
    });

    it('should clear all cache on createOrder', async () => {
      // Cache archive search
      nock(baseUrl)
        .post('/archive/search')
        .reply(200, {
          success: true,
          data: { results: [], total: 0, limit: 10, offset: 0 },
        });

      await client.archiveSearch({ location: { type: 'Point', coordinates: [0, 0] } });

      // Create order clears cache
      nock(baseUrl)
        .post('/orders')
        .reply(200, {
          success: true,
          data: {
            id: 'new-order',
            status: 'pending',
            location: { type: 'Point', coordinates: [0, 0] },
            price: 100,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      await client.createOrder({ archiveId: 'test' });

      // Next archive search makes new request
      let requestCount = 0;
      nock(baseUrl)
        .post('/archive/search')
        .reply(() => {
          requestCount++;
          return [200, {
            success: true,
            data: { results: [], total: 0, limit: 10, offset: 0 },
          }];
        });

      await client.archiveSearch({ location: { type: 'Point', coordinates: [0, 0] } });
      expect(requestCount).toBe(1);
    });

    it('should cache price estimates', async () => {
      const params: PriceEstimateParams = {
        type: 'archive',
        areaKm2: 10,
      };

      let requestCount = 0;

      nock(baseUrl)
        .post('/pricing/estimate')
        .reply(() => {
          requestCount++;
          return [200, {
            success: true,
            data: {
              estimatedPrice: 100,
              currency: 'USD',
              breakdown: { base: 50, area: 30, resolution: 10, urgency: 10 },
            },
          }];
        });

      await client.estimatePrice(params);
      await client.estimatePrice(params);

      expect(requestCount).toBe(1);
    });

    it('should explicitly clear cache when requested', async () => {
      nock(baseUrl)
        .get('/orders/test')
        .times(2)
        .reply(200, {
          success: true,
          data: {
            id: 'test',
            status: 'pending',
            location: { type: 'Point', coordinates: [0, 0] },
            price: 100,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      await client.getOrder('test');
      client.clearCache();
      await client.getOrder('test');

      expect(nock.isDone()).toBe(true);
    });

    it('should clear AOI cache on createAoi', async () => {
      // Cache listAois
      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(200, {
          success: true,
          data: [],
        });

      await client.listAois();

      // Create AOI
      nock(baseUrl)
        .post('/monitoring/aois')
        .reply(200, {
          success: true,
          data: {
            id: 'new-aoi',
            name: 'Test',
            geometry: { type: 'Point', coordinates: [0, 0] },
            active: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      await client.createAoi({
        name: 'Test',
        geometry: { type: 'Point', coordinates: [0, 0] },
      });

      // listAois makes new request
      let requestCount = 0;
      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(() => {
          requestCount++;
          return [200, { success: true, data: [] }];
        });

      await client.listAois();
      expect(requestCount).toBe(1);
    });

    it('should clear AOI cache on updateAoi', async () => {
      nock(baseUrl)
        .put('/monitoring/aois/test-aoi')
        .reply(200, {
          success: true,
          data: {
            id: 'test-aoi',
            name: 'Updated',
            geometry: { type: 'Point', coordinates: [0, 0] },
            active: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      await client.updateAoi('test-aoi', { name: 'Updated' });

      let requestCount = 0;
      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(() => {
          requestCount++;
          return [200, { success: true, data: [] }];
        });

      await client.listAois();
      expect(requestCount).toBe(1);
    });

    it('should clear AOI cache on deleteAoi', async () => {
      nock(baseUrl)
        .delete('/monitoring/aois/test-aoi')
        .reply(200, {
          success: true,
          data: undefined,
        });

      await client.deleteAoi('test-aoi');

      let requestCount = 0;
      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(() => {
          requestCount++;
          return [200, { success: true, data: [] }];
        });

      await client.listAois();
      expect(requestCount).toBe(1);
    });

    it('should clear webhook cache on createAoiWebhook', async () => {
      nock(baseUrl)
        .post('/monitoring/aois/test-aoi/webhooks')
        .reply(200, {
          success: true,
          data: {
            id: 'webhook-1',
            url: 'https://example.com/hook',
            events: ['test'],
            aoiId: 'test-aoi',
            active: true,
            createdAt: '2024-01-01T00:00:00Z',
          },
        });

      await client.createAoiWebhook('test-aoi', {
        url: 'https://example.com/hook',
        events: ['test'],
      });

      let requestCount = 0;
      nock(baseUrl)
        .get('/webhooks')
        .reply(() => {
          requestCount++;
          return [200, { success: true, data: [] }];
        });

      await client.listWebhooks();
      expect(requestCount).toBe(1);
    });

    it('should clear webhook cache on deleteWebhook', async () => {
      nock(baseUrl)
        .delete('/webhooks/test-webhook')
        .reply(200, {
          success: true,
          data: undefined,
        });

      await client.deleteWebhook('test-webhook');

      let requestCount = 0;
      nock(baseUrl)
        .get('/webhooks')
        .reply(() => {
          requestCount++;
          return [200, { success: true, data: [] }];
        });

      await client.listWebhooks();
      expect(requestCount).toBe(1);
    });
  });

  describe('Archive Search - Multiple Endpoint Fallback', () => {
    it('should try multiple endpoints when first fails', async () => {
      const params: ArchiveSearchParams = {
        location: { type: 'Point', coordinates: [0, 0] },
      };

      const expectedResponse = {
        success: true,
        data: {
          results: [{
            id: 'test',
            satellite: 'Test',
            captureDate: '2024-01-01',
            cloudCover: 0,
            resolution: 10,
            price: 0,
          }],
          total: 1,
          limit: 10,
          offset: 0,
        },
      };

      // First endpoint fails
      nock(baseUrl)
        .post('/archive/search')
        .reply(404, { message: 'Not found' });

      // Second endpoint succeeds
      nock(baseUrl)
        .post('/search')
        .reply(200, expectedResponse);

      const result = await client.archiveSearch(params);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(1);
    });

    it('should throw error if all endpoints fail', async () => {
      const params: ArchiveSearchParams = {
        location: { type: 'Point', coordinates: [0, 0] },
      };

      // All endpoints fail
      nock(baseUrl)
        .post('/archive/search')
        .reply(404, { message: 'Not found' });

      nock(baseUrl)
        .post('/search')
        .reply(404, { message: 'Not found' });

      nock(baseUrl)
        .post('/v1/archive/search')
        .reply(404, { message: 'Not found' });

      nock(baseUrl)
        .post('/v1/search')
        .reply(404, { message: 'Not found' });

      nock(baseUrl)
        .post('/open-data/search')
        .reply(404, { message: 'Not found' });

      await expect(client.archiveSearch(params))
        .rejects
        .toThrow();
    });
  });

  describe('Response Format Validation', () => {
    it('should throw error when success=false in response', async () => {
      nock(baseUrl)
        .get('/orders/bad-response')
        .reply(200, {
          success: false,
          error: {
            code: 'CUSTOM_ERROR',
            message: 'Custom error message',
          },
        });

      await expect(client.getOrder('bad-response'))
        .rejects
        .toThrow('Custom error message');
    });

    it('should handle missing error message in unsuccessful response', async () => {
      nock(baseUrl)
        .post('/orders')
        .reply(200, {
          success: false,
          error: {
            code: 'UNKNOWN',
          },
        });

      await expect(client.createOrder({ archiveId: 'test' }))
        .rejects
        .toThrow('API request failed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty response data gracefully', async () => {
      nock(baseUrl)
        .get('/orders')
        .reply(200, {
          success: true,
          data: [],
        });

      const result = await client.listOrders();
      expect(result).toEqual([]);
    });

    it('should handle missing optional fields in responses', async () => {
      nock(baseUrl)
        .get('/orders/minimal')
        .reply(200, {
          success: true,
          data: {
            id: 'minimal',
            status: 'pending',
            location: { type: 'Point', coordinates: [0, 0] },
            price: 100,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      const result = await client.getOrder('minimal');
      expect(result.id).toBe('minimal');
      expect(result.deliveryUrl).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should handle very large response payloads', async () => {
      const largeResults = Array.from({ length: 1000 }, (_, i) => ({
        id: `archive-${i}`,
        satellite: 'Sentinel-2A',
        captureDate: '2024-01-01T00:00:00Z',
        cloudCover: i % 100,
        resolution: 10,
        price: 0,
      }));

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, {
          success: true,
          data: {
            results: largeResults,
            total: 1000,
            limit: 1000,
            offset: 0,
          },
        });

      const result = await client.archiveSearch({
        location: { type: 'Point', coordinates: [0, 0] },
        limit: 1000,
      });

      expect(result.results).toHaveLength(1000);
      expect(result.total).toBe(1000);
    });

    it('should handle special characters in IDs', async () => {
      const specialId = 'order-123-abc_def';

      nock(baseUrl)
        .get(`/orders/${specialId}`)
        .reply(200, {
          success: true,
          data: {
            id: specialId,
            status: 'pending',
            location: { type: 'Point', coordinates: [0, 0] },
            price: 100,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        });

      const result = await client.getOrder(specialId);
      expect(result.id).toBe(specialId);
    });
  });

  describe('Custom Configuration', () => {
    it('should use custom base URL', async () => {
      const customBaseUrl = 'https://custom.api.com';
      const customClient = new SkyFiClient({
        apiKey,
        baseUrl: customBaseUrl,
      });

      let requestMade = false;

      nock(customBaseUrl)
        .get('/orders/test')
        .reply(() => {
          requestMade = true;
          return [200, {
            success: true,
            data: {
              id: 'test',
              status: 'pending',
              location: { type: 'Point', coordinates: [0, 0] },
              price: 100,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          }];
        });

      await customClient.getOrder('test');
      expect(requestMade).toBe(true);
    });

    it('should respect custom retry count', async () => {
      const customClient = new SkyFiClient({
        apiKey,
        baseUrl,
        retries: 5,
      });

      let requestCount = 0;

      nock(baseUrl)
        .get('/orders/many-retries')
        .times(6)
        .reply(() => {
          requestCount++;
          return [500, { message: 'Error' }];
        });

      await expect(customClient.getOrder('many-retries'))
        .rejects
        .toThrow(SkyFiServerError);

      expect(requestCount).toBe(6);
    }, 20000);
  });
});
