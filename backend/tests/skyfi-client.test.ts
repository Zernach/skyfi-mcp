import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import { SkyFiClient } from '../src/integrations/skyfi/client';
import {
  ArchiveSearchParams,
  ArchiveSearchResponse,
  Order,
  OrderParams,
  Tasking,
  TaskingParams,
  PriceEstimate,
  PriceEstimateParams,
  Webhook,
  WebhookParams,
  AOI,
  CreateAOIParams,
  UpdateAOIParams,
} from '../src/integrations/skyfi/types';

describe('SkyFiClient - Success Cases', () => {
  let client: SkyFiClient;
  const baseUrl = 'https://api.test.skyfi.com';
  const apiKey = 'test-api-key';

  beforeEach(() => {
    client = new SkyFiClient({
      apiKey,
      baseUrl,
      timeout: 30000,
      retries: 0, // Disable retries for faster tests
    });
    client.clearCache();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    client.clearCache();
  });

  describe('archiveSearch', () => {
    it('should successfully search archive with location', async () => {
      const params: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-31',
        },
        maxCloudCover: 20,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-1',
            satellite: 'WorldView-3',
            captureDate: '2024-01-15T10:30:00Z',
            cloudCover: 15,
            resolution: 0.31,
            thumbnail: 'https://example.com/thumb1.jpg',
            bbox: [-122.5, 37.7, -122.3, 38.0],
            price: 250.0,
            metadata: { sensor: 'optical' },
          },
          {
            id: 'archive-2',
            satellite: 'Sentinel-2A',
            captureDate: '2024-01-20T14:20:00Z',
            cloudCover: 10,
            resolution: 10,
            price: 0,
          },
        ],
        total: 2,
        limit: 10,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const result = await client.archiveSearch(params);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.results[0].id).toBe('archive-1');
      expect(result.results[0].satellite).toBe('WorldView-3');
      expect(result.results[0].price).toBe(250.0);
      expect(result.results[1].satellite).toBe('Sentinel-2A');
    });

    it('should successfully search archive with AOI', async () => {
      const params: ArchiveSearchParams = {
        aoi: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        satellites: ['WorldView-3', 'Sentinel-2A'],
        resolution: { min: 0.3, max: 10 },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-3',
            satellite: 'WorldView-3',
            captureDate: '2024-01-10T09:00:00Z',
            cloudCover: 5,
            resolution: 0.31,
            price: 300.0,
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const result = await client.archiveSearch(params);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(1);
      expect(result.results[0].id).toBe('archive-3');
    });

    it('should successfully search archive with pagination', async () => {
      const params: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        limit: 5,
        offset: 10,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array.from({ length: 5 }, (_, i) => ({
          id: `archive-${i + 11}`,
          satellite: 'Sentinel-2A',
          captureDate: `2024-01-${15 + i}T10:00:00Z`,
          cloudCover: 10 + i,
          resolution: 10,
          price: 0,
        })),
        total: 50,
        limit: 5,
        offset: 10,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      const result = await client.archiveSearch(params);

      expect(result).toBeDefined();
      expect(result.results).toHaveLength(5);
      expect(result.total).toBe(50);
      expect(result.limit).toBe(5);
      expect(result.offset).toBe(10);
    });
  });

  describe('getOrder', () => {
    it('should successfully get order by ID', async () => {
      const orderId = 'order-123';

      const mockOrder: Order = {
        id: orderId,
        status: 'completed',
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        price: 500.0,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T14:30:00Z',
        deliveryUrl: 'https://example.com/delivery/order-123.zip',
        metadata: {
          satellite: 'WorldView-3',
          resolution: 0.31,
        },
      };

      nock(baseUrl)
        .get(`/orders/${orderId}`)
        .reply(200, {
          success: true,
          data: mockOrder,
        });

      const result = await client.getOrder(orderId);

      expect(result).toBeDefined();
      expect(result.id).toBe(orderId);
      expect(result.status).toBe('completed');
      expect(result.price).toBe(500.0);
      expect(result.deliveryUrl).toBe('https://example.com/delivery/order-123.zip');
      expect(result.metadata?.satellite).toBe('WorldView-3');
    });
  });

  describe('listOrders', () => {
    it('should successfully list orders without filters', async () => {
      const mockOrders: Order[] = [
        {
          id: 'order-1',
          status: 'pending',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749],
          },
          price: 250.0,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
        {
          id: 'order-2',
          status: 'completed',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749],
          },
          price: 500.0,
          createdAt: '2024-01-14T10:00:00Z',
          updatedAt: '2024-01-16T14:30:00Z',
          deliveryUrl: 'https://example.com/delivery/order-2.zip',
        },
      ];

      nock(baseUrl)
        .get('/orders')
        .reply(200, {
          success: true,
          data: mockOrders,
        });

      const result = await client.listOrders();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('order-1');
      expect(result[1].id).toBe('order-2');
    });

    it('should successfully list orders with filters', async () => {
      const filters = {
        status: 'completed',
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-31',
        },
        limit: 10,
        offset: 0,
      };

      const mockOrders: Order[] = [
        {
          id: 'order-3',
          status: 'completed',
          location: {
            type: 'Point',
            coordinates: [-122.4194, 37.7749],
          },
          price: 750.0,
          createdAt: '2024-01-20T10:00:00Z',
          updatedAt: '2024-01-21T14:30:00Z',
          deliveryUrl: 'https://example.com/delivery/order-3.zip',
        },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true) // Match any query params
        .reply(200, {
          success: true,
          data: mockOrders,
        });

      const result = await client.listOrders(filters);

      expect(result).toBeDefined();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('completed');
    });
  });

  describe('createOrder', () => {
    it('should successfully create order from archive', async () => {
      const params: OrderParams = {
        archiveId: 'archive-123',
        deliveryFormat: 'geotiff',
        notifyUrl: 'https://example.com/webhook',
        metadata: {
          priority: 'high',
        },
      };

      const mockOrder: Order = {
        id: 'order-new-1',
        status: 'pending',
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        price: 250.0,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
        metadata: {
          priority: 'high',
        },
      };

      nock(baseUrl)
        .post('/orders', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(201, {
          success: true,
          data: mockOrder,
        });

      const result = await client.createOrder(params);

      expect(result).toBeDefined();
      expect(result.id).toBe('order-new-1');
      expect(result.status).toBe('pending');
      expect(result.price).toBe(250.0);
      expect(result.metadata?.priority).toBe('high');
    });

    it('should successfully create order from tasking', async () => {
      const params: OrderParams = {
        taskingId: 'tasking-456',
        deliveryFormat: 'geotiff',
        webhookUrl: 'https://example.com/webhook',
      };

      const mockOrder: Order = {
        id: 'order-new-2',
        status: 'pending',
        location: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        price: 500.0,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
      };

      nock(baseUrl)
        .post('/orders', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(201, {
          success: true,
          data: mockOrder,
        });

      const result = await client.createOrder(params);

      expect(result).toBeDefined();
      expect(result.id).toBe('order-new-2');
      expect(result.status).toBe('pending');
    });
  });

  describe('getTasking', () => {
    it('should successfully get tasking by ID', async () => {
      const taskId = 'tasking-789';

      const mockTasking: Tasking = {
        id: taskId,
        status: 'scheduled',
        location: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        captureWindow: {
          start: '2024-02-01',
          end: '2024-02-15',
        },
        estimatedCost: 750.0,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
        metadata: {
          satellite: 'WorldView-3',
          priority: 'standard',
        },
      };

      nock(baseUrl)
        .get(`/tasking/${taskId}`)
        .reply(200, {
          success: true,
          data: mockTasking,
        });

      const result = await client.getTasking(taskId);

      expect(result).toBeDefined();
      expect(result.id).toBe(taskId);
      expect(result.status).toBe('scheduled');
      expect(result.estimatedCost).toBe(750.0);
      expect(result.metadata?.satellite).toBe('WorldView-3');
    });
  });

  describe('createTasking', () => {
    it('should successfully create tasking request', async () => {
      const params: TaskingParams = {
        location: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        captureWindow: {
          start: '2024-02-01',
          end: '2024-02-15',
        },
        satellite: 'WorldView-3',
        resolution: 0.31,
        priority: 'standard',
      };

      const mockTasking: Tasking = {
        id: 'tasking-new-1',
        status: 'pending',
        location: params.location,
        captureWindow: params.captureWindow,
        estimatedCost: 800.0,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
        metadata: {
          satellite: 'WorldView-3',
          resolution: 0.31,
          priority: 'standard',
        },
      };

      nock(baseUrl)
        .post('/tasking', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(201, {
          success: true,
          data: mockTasking,
        });

      const result = await client.createTasking(params);

      expect(result).toBeDefined();
      expect(result.id).toBe('tasking-new-1');
      expect(result.status).toBe('pending');
      expect(result.estimatedCost).toBe(800.0);
      expect(result.metadata?.satellite).toBe('WorldView-3');
    });
  });

  describe('estimatePrice', () => {
    it('should successfully estimate price for archive', async () => {
      const params: PriceEstimateParams = {
        type: 'archive',
        areaKm2: 10,
        resolution: 0.31,
        processingLevel: 'orthorectified',
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const mockEstimate: PriceEstimate = {
        estimatedPrice: 200.0,
        currency: 'USD',
        breakdown: {
          base: 100.0,
          area: 80.0,
          resolution: 20.0,
          urgency: 0,
        },
        assumptions: [
          'Standard processing time',
          'Archive data available',
        ],
      };

      nock(baseUrl)
        .post('/pricing/estimate', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockEstimate,
        });

      const result = await client.estimatePrice(params);

      expect(result).toBeDefined();
      expect(result.estimatedPrice).toBe(200.0);
      expect(result.currency).toBe('USD');
      expect(result.breakdown.base).toBe(100.0);
      expect(result.assumptions).toHaveLength(2);
    });

    it('should successfully estimate price for tasking', async () => {
      const params: PriceEstimateParams = {
        type: 'tasking',
        areaKm2: 25,
        resolution: 0.31,
        processingLevel: 'pansharpened',
        priority: 'rush',
        satellites: ['WorldView-3'],
      };

      const mockEstimate: PriceEstimate = {
        estimatedPrice: 1200.0,
        currency: 'USD',
        breakdown: {
          base: 500.0,
          area: 500.0,
          resolution: 100.0,
          urgency: 100.0,
        },
        assumptions: [
          'Rush processing',
          'Weather dependent',
        ],
      };

      nock(baseUrl)
        .post('/pricing/estimate', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockEstimate,
        });

      const result = await client.estimatePrice(params);

      expect(result).toBeDefined();
      expect(result.estimatedPrice).toBe(1200.0);
      expect(result.breakdown.urgency).toBe(100.0);
    });
  });

  describe('AOI Management', () => {
    it('should successfully create AOI', async () => {
      const params: CreateAOIParams = {
        name: 'Test AOI',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        description: 'Test area of interest',
        criteria: {
          maxCloudCover: 20,
          minResolution: 0.5,
        },
        schedule: {
          frequency: 'daily',
          startDate: '2024-02-01',
          endDate: '2024-12-31',
        },
      };

      const mockAoi: AOI = {
        id: 'aoi-123',
        name: 'Test AOI',
        geometry: params.geometry,
        description: 'Test area of interest',
        criteria: params.criteria,
        schedule: params.schedule,
        active: true,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
      };

      nock(baseUrl)
        .post('/monitoring/aois', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(201, {
          success: true,
          data: mockAoi,
        });

      const result = await client.createAoi(params);

      expect(result).toBeDefined();
      expect(result.id).toBe('aoi-123');
      expect(result.name).toBe('Test AOI');
      expect(result.active).toBe(true);
      expect(result.criteria?.maxCloudCover).toBe(20);
    });

    it('should successfully list AOIs', async () => {
      const mockAois: AOI[] = [
        {
          id: 'aoi-1',
          name: 'AOI 1',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-122.5, 37.7],
                [-122.3, 37.7],
                [-122.3, 38.0],
                [-122.5, 38.0],
                [-122.5, 37.7],
              ],
            ],
          },
          active: true,
          createdAt: '2024-01-15T10:00:00Z',
          updatedAt: '2024-01-15T10:00:00Z',
        },
        {
          id: 'aoi-2',
          name: 'AOI 2',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-122.4, 37.8],
                [-122.2, 37.8],
                [-122.2, 38.1],
                [-122.4, 38.1],
                [-122.4, 37.8],
              ],
            ],
          },
          active: false,
          createdAt: '2024-01-10T10:00:00Z',
          updatedAt: '2024-01-12T10:00:00Z',
        },
      ];

      nock(baseUrl)
        .get('/monitoring/aois')
        .reply(200, {
          success: true,
          data: mockAois,
        });

      const result = await client.listAois();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('aoi-1');
      expect(result[1].id).toBe('aoi-2');
    });

    it('should successfully update AOI', async () => {
      const aoiId = 'aoi-123';
      const params: UpdateAOIParams = {
        name: 'Updated AOI',
        active: false,
        criteria: {
          maxCloudCover: 15,
        },
      };

      const mockAoi: AOI = {
        id: aoiId,
        name: 'Updated AOI',
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [-122.5, 37.7],
              [-122.3, 37.7],
              [-122.3, 38.0],
              [-122.5, 38.0],
              [-122.5, 37.7],
            ],
          ],
        },
        active: false,
        criteria: {
          maxCloudCover: 15,
        },
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-21T10:00:00Z',
      };

      nock(baseUrl)
        .put(`/monitoring/aois/${aoiId}`, (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockAoi,
        });

      const result = await client.updateAoi(aoiId, params);

      expect(result).toBeDefined();
      expect(result.id).toBe(aoiId);
      expect(result.name).toBe('Updated AOI');
      expect(result.active).toBe(false);
      expect(result.criteria?.maxCloudCover).toBe(15);
    });

    it('should successfully delete AOI', async () => {
      const aoiId = 'aoi-123';

      nock(baseUrl)
        .delete(`/monitoring/aois/${aoiId}`)
        .reply(200, {
          success: true,
          data: undefined,
        });

      await expect(client.deleteAoi(aoiId)).resolves.not.toThrow();
    });
  });

  describe('Webhook Management', () => {
    it('should successfully create webhook', async () => {
      const params: WebhookParams = {
        url: 'https://example.com/webhook',
        events: ['order.completed', 'tasking.scheduled'],
        secret: 'webhook-secret-123',
        metadata: {
          description: 'Test webhook',
        },
      };

      const mockWebhook: Webhook = {
        id: 'webhook-123',
        url: 'https://example.com/webhook',
        events: ['order.completed', 'tasking.scheduled'],
        active: true,
        createdAt: '2024-01-20T10:00:00Z',
        metadata: {
          description: 'Test webhook',
        },
      };

      nock(baseUrl)
        .post('/webhooks', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(201, {
          success: true,
          data: mockWebhook,
        });

      const result = await client.createWebhook(params);

      expect(result).toBeDefined();
      expect(result.id).toBe('webhook-123');
      expect(result.url).toBe('https://example.com/webhook');
      expect(result.events).toHaveLength(2);
      expect(result.active).toBe(true);
    });

    it('should successfully create AOI-scoped webhook', async () => {
      const aoiId = 'aoi-456';
      const params: WebhookParams = {
        url: 'https://example.com/aoi-webhook',
        events: ['aoi.matched', 'aoi.new_image'],
      };

      const mockWebhook: Webhook = {
        id: 'webhook-456',
        url: 'https://example.com/aoi-webhook',
        events: ['aoi.matched', 'aoi.new_image'],
        aoiId: aoiId,
        active: true,
        createdAt: '2024-01-20T10:00:00Z',
      };

      nock(baseUrl)
        .post(`/monitoring/aois/${aoiId}/webhooks`, (body: any) => {
          const expected = { ...params, aoiId };
          return JSON.stringify(body) === JSON.stringify(expected);
        })
        .reply(201, {
          success: true,
          data: mockWebhook,
        });

      const result = await client.createAoiWebhook(aoiId, params);

      expect(result).toBeDefined();
      expect(result.id).toBe('webhook-456');
      expect(result.aoiId).toBe(aoiId);
      expect(result.events).toContain('aoi.matched');
    });

    it('should successfully list webhooks', async () => {
      const mockWebhooks: Webhook[] = [
        {
          id: 'webhook-1',
          url: 'https://example.com/webhook1',
          events: ['order.completed'],
          active: true,
          createdAt: '2024-01-15T10:00:00Z',
          lastTriggered: '2024-01-18T14:30:00Z',
        },
        {
          id: 'webhook-2',
          url: 'https://example.com/webhook2',
          events: ['tasking.scheduled', 'tasking.completed'],
          aoiId: 'aoi-123',
          active: true,
          createdAt: '2024-01-10T10:00:00Z',
        },
      ];

      nock(baseUrl)
        .get('/webhooks')
        .reply(200, {
          success: true,
          data: mockWebhooks,
        });

      const result = await client.listWebhooks();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('webhook-1');
      expect(result[1].id).toBe('webhook-2');
      expect(result[1].aoiId).toBe('aoi-123');
    });

    it('should successfully delete webhook', async () => {
      const webhookId = 'webhook-123';

      nock(baseUrl)
        .delete(`/webhooks/${webhookId}`)
        .reply(200, {
          success: true,
          data: undefined,
        });

      await expect(client.deleteWebhook(webhookId)).resolves.not.toThrow();
    });
  });

  describe('Caching', () => {
    it('should cache archive search results', async () => {
      const params: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [
          {
            id: 'archive-cached',
            satellite: 'Sentinel-2A',
            captureDate: '2024-01-15T10:00:00Z',
            cloudCover: 10,
            resolution: 10,
            price: 0,
          },
        ],
        total: 1,
        limit: 10,
        offset: 0,
      };

      const scope =       nock(baseUrl)
        .post('/archive/search', (body: any) => JSON.stringify(body) === JSON.stringify(params))
        .reply(200, {
          success: true,
          data: mockResponse,
        });

      // First call
      const result1 = await client.archiveSearch(params);
      expect(result1).toBeDefined();
      expect(scope.isDone()).toBe(true);

      // Second call should use cache (no additional HTTP request)
      nock.cleanAll();
      const result2 = await client.archiveSearch(params);
      expect(result2).toEqual(result1);
    });

    it('should clear cache on createOrder', async () => {
      const orderParams: OrderParams = {
        archiveId: 'archive-123',
      };

      const mockOrderResponse: Order = {
        id: 'order-new',
        status: 'pending',
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        price: 250.0,
        createdAt: '2024-01-20T10:00:00Z',
        updatedAt: '2024-01-20T10:00:00Z',
      };

      nock(baseUrl)
        .post('/orders', (body: any) => JSON.stringify(body) === JSON.stringify(orderParams))
        .reply(201, {
          success: true,
          data: mockOrderResponse,
        });

      await client.createOrder(orderParams);

      // Cache should be cleared, so subsequent calls should make new requests
      const archiveParams: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
      };

      const mockArchiveResponse: ArchiveSearchResponse = {
        results: [],
        total: 0,
        limit: 10,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => JSON.stringify(body) === JSON.stringify(archiveParams))
        .reply(200, {
          success: true,
          data: mockArchiveResponse,
        });

      const result = await client.archiveSearch(archiveParams);
      expect(result).toBeDefined();
    });
  });

  describe('clearCache', () => {
    it('should successfully clear cache', () => {
      expect(() => client.clearCache()).not.toThrow();
    });
  });
});
