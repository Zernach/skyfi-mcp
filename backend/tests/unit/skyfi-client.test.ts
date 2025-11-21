import nock from 'nock';
import { SkyFiClient } from '../../src/integrations/skyfi/client';
import {
  SkyFiAuthError,
  SkyFiNotFoundError,
  SkyFiValidationError,
  SkyFiRateLimitError,
} from '../../src/integrations/skyfi/errors';

describe('SkyFiClient', () => {
  const baseUrl = 'https://api.skyfi.com/v1';
  const apiKey = 'test-api-key';
  let client: SkyFiClient;

  beforeEach(() => {
    client = new SkyFiClient({ apiKey, baseUrl, retries: 1 });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Authentication', () => {
    it('should include API key in headers', async () => {
      const scope = nock(baseUrl, {
        reqheaders: {
          'x-skyfi-api-key': apiKey,
        },
      })
        .get('/orders/test-id')
        .reply(200, { success: true, data: { id: 'test-id' } });

      await client.getOrder('test-id');
      expect(scope.isDone()).toBe(true);
    });

    it('should throw auth error on 401', async () => {
      nock(baseUrl).get('/orders/test-id').reply(401, { message: 'Unauthorized' });

      await expect(client.getOrder('test-id')).rejects.toThrow(SkyFiAuthError);
    });
  });

  describe('Error Handling', () => {
    it('should throw validation error on 400', async () => {
      nock(baseUrl).post('/orders').reply(400, { message: 'Invalid request' });

      await expect(client.createOrder({})).rejects.toThrow(SkyFiValidationError);
    });

    it('should throw not found error on 404', async () => {
      nock(baseUrl).get('/orders/nonexistent').reply(404, { message: 'Not found' });

      await expect(client.getOrder('nonexistent')).rejects.toThrow(SkyFiNotFoundError);
    });

    it('should throw rate limit error on 429', async () => {
      nock(baseUrl)
        .get('/orders/test-id')
        .reply(429, { message: 'Rate limit exceeded' }, { 'retry-after': '60' });

      await expect(client.getOrder('test-id')).rejects.toThrow(SkyFiRateLimitError);
    });
  });

  describe('API Methods', () => {
    it('should perform archive search', async () => {
      const mockResponse = {
        results: [
          {
            id: 'img-1',
            satellite: 'Sentinel-2',
            captureDate: '2025-01-01',
            cloudCover: 5,
            resolution: 10,
            thumbnail: 'http://example.com/thumb.jpg',
            bbox: [-74, 40, -73, 41],
            price: 100,
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      };

      nock(baseUrl).post('/archive/search').reply(200, { success: true, data: mockResponse });

      const result = await client.archiveSearch({
        location: { type: 'Point', coordinates: [-74, 40] },
      });

      expect(result.results).toHaveLength(1);
      expect(result.results[0].satellite).toBe('Sentinel-2');
    });

    it('should get order by ID', async () => {
      const mockOrder = {
        id: 'order-1',
        status: 'completed',
        location: { type: 'Point', coordinates: [-74, 40] },
        price: 100,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-02',
      };

      nock(baseUrl).get('/orders/order-1').reply(200, { success: true, data: mockOrder });

      const result = await client.getOrder('order-1');

      expect(result.id).toBe('order-1');
      expect(result.status).toBe('completed');
    });

    it('should create order', async () => {
      const mockOrder = {
        id: 'new-order',
        status: 'pending',
        location: { type: 'Point', coordinates: [-74, 40] },
        price: 100,
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      };

      nock(baseUrl).post('/orders').reply(200, { success: true, data: mockOrder });

      const result = await client.createOrder({
        archiveId: 'img-1',
        deliveryFormat: 'GeoTIFF',
      });

      expect(result.id).toBe('new-order');
    });

    it('should estimate price', async () => {
      const mockEstimate = {
        estimatedPrice: 150,
        currency: 'USD',
        breakdown: {
          base: 50,
          area: 50,
          resolution: 30,
          urgency: 20,
        },
      };

      nock(baseUrl).post('/pricing/estimate').reply(200, { success: true, data: mockEstimate });

      const result = await client.estimatePrice({
        type: 'archive',
        areaKm2: 25,
        location: { type: 'Point', coordinates: [-74, 40] },
      });

      expect(result.estimatedPrice).toBe(150);
      expect(result.currency).toBe('USD');
    });
  });

  describe('Caching', () => {
    it('should cache archive search results', async () => {
      const mockResponse = {
        results: [],
        total: 0,
        limit: 10,
        offset: 0,
      };

      const scope = nock(baseUrl)
        .post('/archive/search')
        .once()
        .reply(200, { success: true, data: mockResponse });

      // First call
      await client.archiveSearch({
        location: { type: 'Point', coordinates: [-74, 40] },
      });

      // Second call should use cache (no new HTTP request)
      await client.archiveSearch({
        location: { type: 'Point', coordinates: [-74, 40] },
      });

      expect(scope.isDone()).toBe(true);
    });

    it('should clear cache', async () => {
      const mockResponse = {
        results: [],
        total: 0,
        limit: 10,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .twice()
        .reply(200, { success: true, data: mockResponse });

      // First call
      await client.archiveSearch({
        location: { type: 'Point', coordinates: [-74, 40] },
      });

      // Clear cache
      client.clearCache();

      // Second call should make new HTTP request
      await client.archiveSearch({
        location: { type: 'Point', coordinates: [-74, 40] },
      });
    });
  });
});
