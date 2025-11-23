import nock from 'nock';
import { SkyFiClient } from '../src/integrations/skyfi/client';
import {
  validateArchiveSearchParams,
  validateTaskingParams,
  validateAOIParams,
  validateWebhookParams,
} from '../src/integrations/skyfi/validation';
import {
  recommendSatellites,
  compareSatellites,
  filterSatellitesByResolution,
} from '../src/integrations/skyfi/satellite-capabilities';
import {
  ArchiveSearchParams,
  ArchiveSearchResponse,
  Order,
  OrderParams,
  Tasking,
  TaskingParams,
  AOI,
  CreateAOIParams,
  Webhook,
  WebhookParams,
  SkyFiAPIResponse,
} from '../src/integrations/skyfi/types';

/**
 * Integration Tests - End-to-End Workflows
 * 
 * These tests demonstrate complete workflows combining:
 * - Validation functions
 * - Satellite recommendations
 * - API client operations
 */
describe('SkyFi Integration Tests - Complete Workflows', () => {
  let client: SkyFiClient;
  const baseUrl = 'https://api.skyfi.test';
  const apiKey = 'test-api-key-12345';

  beforeEach(() => {
    client = new SkyFiClient({
      apiKey,
      baseUrl,
      timeout: 5000,
      retries: 2,
    });
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    client.clearCache();
  });

  describe('Workflow 1: Archive Search with Satellite Recommendations', () => {
    it('should recommend satellites, validate params, and search archive', async () => {
      // Step 1: User wants agriculture monitoring
      const useCase = 'agriculture';
      const recommendations = recommendSatellites(useCase, 'cost');

      // Should recommend free satellites first
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations[0].pricing.archivePerKm2).toBe(0);

      // Step 2: Build search params from recommendations
      const searchParams: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749], // San Francisco
        },
        startDate: '2023-06-01',
        endDate: '2023-08-31',
        maxCloudCover: 20,
        satellites: recommendations.slice(0, 2).map(s => s.name), // Top 2
        minResolution: 10,
      };

      // Step 3: Validate parameters
      const validation = validateArchiveSearchParams(searchParams);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Step 4: Search archive
      const mockResponse: SkyFiAPIResponse<ArchiveSearchResponse> = {
        success: true,
        data: {
          results: [
            {
              id: 'img-001',
              satellite: recommendations[0].name,
              captureDate: '2023-07-15T10:30:00Z',
              cloudCover: 10,
              resolution: 10,
              price: 0,
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, mockResponse);

      const results = await client.archiveSearch(searchParams);

      expect(results.results).toHaveLength(1);
      expect(results.results[0].price).toBe(0); // Free satellite
    });
  });

  describe('Workflow 2: Compare Satellites and Create Tasking', () => {
    it('should compare satellites, validate tasking, and schedule capture', async () => {
      // Step 1: Compare high-resolution satellites
      const comparison = compareSatellites(['WorldView-3', 'Pléiades Neo 3']);

      expect(comparison.satellites).toHaveLength(2);
      expect(comparison.comparison.resolution['WorldView-3'].panchromatic).toBe(0.31);
      expect(comparison.comparison.resolution['Pléiades Neo 3'].panchromatic).toBe(0.30);

      // Step 2: Choose best resolution satellite
      const bestSatellite = comparison.satellites.reduce((best, current) => {
        const bestRes = best.resolution.panchromatic || 100;
        const currentRes = current.resolution.panchromatic || 100;
        return currentRes < bestRes ? current : best;
      });

      expect(bestSatellite.name).toBe('Pléiades Neo 3');

      // Step 3: Create tasking params
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const endDate = new Date(futureDate.getTime() + 7 * 24 * 60 * 60 * 1000);

      const taskingParams: TaskingParams = {
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
        captureWindow: {
          start: futureDate.toISOString(),
          end: endDate.toISOString(),
        },
        satellite: bestSatellite.name,
        resolution: bestSatellite.resolution.panchromatic,
        priority: 'standard',
      };

      // Step 4: Validate tasking params (with proper format for validation function)
      const validationParams = {
        ...taskingParams,
        startDate: taskingParams.captureWindow.start,
        endDate: taskingParams.captureWindow.end,
      };
      const validation = validateTaskingParams(validationParams);
      expect(validation.valid).toBe(true);

      // Step 5: Create tasking
      const mockTasking: Tasking = {
        id: 'task-001',
        status: 'pending',
        location: taskingParams.location,
        captureWindow: taskingParams.captureWindow,
        estimatedCost: 2000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockResponse: SkyFiAPIResponse<Tasking> = {
        success: true,
        data: mockTasking,
      };

      nock(baseUrl)
        .post('/tasking')
        .reply(200, mockResponse);

      const result = await client.createTasking(taskingParams);

      expect(result.id).toBe('task-001');
      expect(result.status).toBe('pending');
    });
  });

  describe('Workflow 3: Create AOI with Webhook Monitoring', () => {
    it('should filter satellites, create AOI, and setup webhook', async () => {
      // Step 1: Filter satellites for medium resolution monitoring
      const suitableSatellites = filterSatellitesByResolution(5, 15);

      expect(suitableSatellites.length).toBeGreaterThan(0);

      // Step 2: Create AOI params
      const aoiParams: CreateAOIParams = {
        name: 'San Francisco Bay Monitoring',
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
        description: 'Monitor urban development and environmental changes',
        criteria: {
          maxCloudCover: 20,
          minResolution: 10,
          events: ['new_imagery'],
        },
        schedule: {
          frequency: 'weekly',
          startDate: '2024-01-01',
          timezone: 'America/Los_Angeles',
        },
      };

      // Step 3: Validate AOI params
      const aoiValidation = validateAOIParams(aoiParams);
      expect(aoiValidation.valid).toBe(true);

      // Step 4: Create AOI
      const mockAOI: AOI = {
        id: 'aoi-001',
        name: aoiParams.name,
        geometry: aoiParams.geometry,
        description: aoiParams.description,
        criteria: aoiParams.criteria,
        schedule: aoiParams.schedule,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockAoiResponse: SkyFiAPIResponse<AOI> = {
        success: true,
        data: mockAOI,
      };

      nock(baseUrl)
        .post('/monitoring/aois')
        .reply(200, mockAoiResponse);

      const aoi = await client.createAoi(aoiParams);

      expect(aoi.id).toBe('aoi-001');
      expect(aoi.active).toBe(true);

      // Step 5: Create webhook for AOI
      const webhookParams: WebhookParams = {
        url: 'https://example.com/skyfi-webhook',
        events: ['aoi.data.available', 'aoi.capture.completed'],
      };

      // Step 6: Validate webhook params
      const webhookValidation = validateWebhookParams(webhookParams);
      expect(webhookValidation.valid).toBe(true);

      // Step 7: Create webhook
      const mockWebhook: Webhook = {
        id: 'webhook-001',
        url: webhookParams.url,
        events: webhookParams.events,
        aoiId: aoi.id,
        active: true,
        createdAt: new Date().toISOString(),
      };

      const mockWebhookResponse: SkyFiAPIResponse<Webhook> = {
        success: true,
        data: mockWebhook,
      };

      nock(baseUrl)
        .post(`/monitoring/aois/${aoi.id}/webhooks`)
        .reply(200, mockWebhookResponse);

      const webhook = await client.createAoiWebhook(aoi.id, webhookParams);

      expect(webhook.id).toBe('webhook-001');
      expect(webhook.aoiId).toBe(aoi.id);
      expect(webhook.active).toBe(true);
    });
  });

  describe('Workflow 4: Archive Search to Order Placement', () => {
    it('should search archive, validate results, and place order', async () => {
      // Step 1: Search archive with validated params
      const searchParams: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        maxCloudCover: 10,
        minResolution: 1,
      };

      const validation = validateArchiveSearchParams(searchParams);
      expect(validation.valid).toBe(true);

      // Step 2: Search archive
      const mockSearchResponse: SkyFiAPIResponse<ArchiveSearchResponse> = {
        success: true,
        data: {
          results: [
            {
              id: 'img-001',
              satellite: 'WorldView-3',
              captureDate: '2023-06-15T10:30:00Z',
              cloudCover: 5,
              resolution: 0.31,
              price: 500,
            },
            {
              id: 'img-002',
              satellite: 'Pléiades Neo 3',
              captureDate: '2023-07-20T11:00:00Z',
              cloudCover: 8,
              resolution: 0.30,
              price: 450,
            },
          ],
          total: 2,
          limit: 10,
          offset: 0,
        },
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, mockSearchResponse);

      const searchResults = await client.archiveSearch(searchParams);

      expect(searchResults.results).toHaveLength(2);

      // Step 3: Select best result (lowest price with acceptable quality)
      const selectedImage = searchResults.results.reduce((best, current) => {
        const currentPrice = current.price ?? 0;
        const bestPrice = best.price ?? 0;
        if (current.cloudCover <= 10 && currentPrice < bestPrice) {
          return current;
        }
        return best;
      });

      expect(selectedImage.id).toBe('img-002'); // Better price

      // Step 4: Place order
      const orderParams: OrderParams = {
        archiveId: selectedImage.id,
        deliveryFormat: 'GeoTIFF',
        webhookUrl: 'https://example.com/order-webhook',
        metadata: {
          project: 'urban-analysis',
          user: 'test-user',
        },
      };

      const mockOrder: Order = {
        id: 'order-001',
        status: 'pending',
        location: searchParams.location!,
        price: selectedImage.price ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: orderParams.metadata,
      };

      const mockOrderResponse: SkyFiAPIResponse<Order> = {
        success: true,
        data: mockOrder,
      };

      nock(baseUrl)
        .post('/orders')
        .reply(200, mockOrderResponse);

      const order = await client.createOrder(orderParams);

      expect(order.id).toBe('order-001');
      expect(order.status).toBe('pending');
      expect(order.price).toBe(450);
    });
  });

  describe('Workflow 5: Cost-Optimized Satellite Selection', () => {
    it('should recommend free satellites for budget-conscious users', async () => {
      // Step 1: Get cost-optimized recommendations
      const recommendations = recommendSatellites('environmental', 'cost');

      expect(recommendations.length).toBeGreaterThan(0);
      
      // Free satellites should be first
      const freeSatellites = recommendations.filter(s => s.pricing.archivePerKm2 === 0);
      expect(freeSatellites.length).toBeGreaterThan(0);
      expect(recommendations[0].pricing.archivePerKm2).toBe(0);

      // Step 2: Compare free satellite options
      const freeSatelliteNames = freeSatellites.slice(0, 3).map(s => s.name);
      const comparison = compareSatellites(freeSatelliteNames);

      expect(comparison.satellites.length).toBeGreaterThan(0);

      // Step 3: Select best free satellite based on requirements
      const bestFreeSatellite = comparison.satellites.reduce((best, current) => {
        // Prefer higher resolution and wider coverage
        const bestScore = (best.swathWidth * 100) / (best.resolution.multispectral || 100);
        const currentScore = (current.swathWidth * 100) / (current.resolution.multispectral || 100);
        return currentScore > bestScore ? current : best;
      });

      // Step 4: Search with selected free satellite
      const searchParams: ArchiveSearchParams = {
        location: {
          type: 'Point',
          coordinates: [-122.4194, 37.7749],
        },
        startDate: '2023-01-01',
        endDate: '2023-12-31',
        satellites: [bestFreeSatellite.name],
        maxCloudCover: 25,
      };

      const mockResponse: SkyFiAPIResponse<ArchiveSearchResponse> = {
        success: true,
        data: {
          results: [
            {
              id: 'img-free-001',
              satellite: bestFreeSatellite.name,
              captureDate: '2023-06-15T10:30:00Z',
              cloudCover: 15,
              resolution: bestFreeSatellite.resolution.multispectral || 10,
              price: 0, // Free!
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, mockResponse);

      const results = await client.archiveSearch(searchParams);

      expect(results.results[0].price).toBe(0);
      expect(results.results[0].satellite).toBe(bestFreeSatellite.name);
    });
  });

  describe('Workflow 6: Multi-Step Order Tracking', () => {
    it('should create order, track status, and manage lifecycle', async () => {
      // Step 1: Create order
      const orderParams: OrderParams = {
        archiveId: 'img-001',
        deliveryFormat: 'GeoTIFF',
      };

      const mockOrder: Order = {
        id: 'order-track-001',
        status: 'pending',
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        price: 300,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      nock(baseUrl)
        .post('/orders')
        .reply(200, { success: true, data: mockOrder });

      const createdOrder = await client.createOrder(orderParams);
      expect(createdOrder.status).toBe('pending');

      // Step 2: Check order status (processing)
      const processingOrder: Order = {
        ...mockOrder,
        status: 'processing',
        updatedAt: new Date().toISOString(),
      };

      nock(baseUrl)
        .get(`/orders/${createdOrder.id}`)
        .reply(200, { success: true, data: processingOrder });

      const status1 = await client.getOrder(createdOrder.id);
      expect(status1.status).toBe('processing');

      // Clear cache to allow fetching updated status
      client.clearCache();

      // Step 3: Check order status (completed)
      const completedOrder: Order = {
        ...processingOrder,
        status: 'completed',
        deliveryUrl: 'https://example.com/download/imagery.zip',
        updatedAt: new Date().toISOString(),
      };

      nock(baseUrl)
        .get(`/orders/${createdOrder.id}`)
        .reply(200, { success: true, data: completedOrder });

      const status2 = await client.getOrder(createdOrder.id);
      expect(status2.status).toBe('completed');
      expect(status2.deliveryUrl).toBeDefined();

      // Step 4: List all orders to verify
      nock(baseUrl)
        .get('/orders')
        .reply(200, { success: true, data: [completedOrder] });

      const allOrders = await client.listOrders();
      expect(allOrders).toHaveLength(1);
      expect(allOrders[0].id).toBe(createdOrder.id);
    });
  });
});

