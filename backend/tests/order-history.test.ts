import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import nock from 'nock';
import { OrderHistoryService } from '../src/services/order-history.service';
import { SkyFiClient } from '../src/integrations/skyfi/client';
import { Order } from '../src/integrations/skyfi/types';
import * as skyfiClientModule from '../src/integrations/skyfi/client';

describe('OrderHistoryService - P0 Feature #6: Previous Orders Exploration', () => {
  let service: OrderHistoryService;
  let testClient: SkyFiClient;
  const conversationId = 'test-conversation-123';
  const baseUrl = 'https://api.test.skyfi.com';

  beforeEach(() => {
    service = new OrderHistoryService();
    service.reset();

    // Create test client
    testClient = new SkyFiClient({
      apiKey: 'test-api-key',
      baseUrl,
      timeout: 30000,
      retries: 0,
    });
    testClient.clearCache();

    // Mock the singleton skyfiClient
    jest.spyOn(skyfiClientModule, 'skyfiClient', 'get').mockReturnValue(testClient);

    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    service.reset();
    jest.restoreAllMocks();
  });

  describe('Session Creation and Management', () => {
    it('should create a new session on first order listing', async () => {
      const filters = {
        status: 'completed',
      };

      const mockOrders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        updatedAt: '2024-01-15T11:00:00Z',
        price: 250.0,
        currency: 'USD',
        deliveryUrl: `https://delivery.skyfi.com/order-${i}`,
        metadata: { archiveId: `archive-${i}` },
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.page.index).toBe(1);
      expect(result.page.count).toBe(20);
      expect(result.orders).toHaveLength(20);
      expect(result.context.storedPages).toBe(1);
      expect(result.context.uniqueOrders).toBe(20);
    });

    it('should reuse existing session when sessionId is provided', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const firstResult = await service.listOrders(conversationId, filters);
      const sessionId = firstResult.sessionId;

      const secondResult = await service.listOrders(conversationId, {
        sessionId,
        action: 'next',
      });

      expect(secondResult.sessionId).toBe(sessionId);
      expect(secondResult.page.index).toBe(2);
    });

    it('should track unique order IDs across pages', async () => {
      const filters = { status: 'completed' };

      const page1Orders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      const page2Orders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i + 20}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: page1Orders });

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: page2Orders });

      const result1 = await service.listOrders(conversationId, filters);
      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        action: 'next',
      });

      expect(result2.context.uniqueOrders).toBe(40);
    });

    it('should handle duplicate order IDs correctly', async () => {
      const filters = { status: 'completed' };

      const orders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
        { id: 'order-2', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 200, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: orders });

      const result1 = await service.listOrders(conversationId, filters);
      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        action: 'current',
      });

      expect(result2.context.uniqueOrders).toBe(2); // Should not double-count
    });

    it('should throw error when no filters provided for new session', async () => {
      await expect(
        service.listOrders(conversationId, {})
      ).rejects.toThrow('Order history requests require at least one filter or an existing session');
    });
  });

  describe('Pagination - Next/Previous/First/Current Actions', () => {
    it('should navigate to next page using action=next', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        Array(20).fill(null).map((_, i) => ({
          id: `order-${offset + i}`,
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          price: 250.0,
          currency: 'USD',
        }));

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.offset === '0')
        .reply(200, { success: true, data: createMockOrders(0) });

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.offset === '20')
        .reply(200, { success: true, data: createMockOrders(20) });

      const page1 = await service.listOrders(conversationId, filters);
      expect(page1.page.index).toBe(1);
      expect(page1.page.offset).toBe(0);
      expect(page1.orders[0].id).toBe('order-0');

      const page2 = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'next',
      });
      expect(page2.page.index).toBe(2);
      expect(page2.page.offset).toBe(20);
      expect(page2.orders[0].id).toBe('order-20');
    });

    it('should navigate to previous page using action=previous', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        Array(20).fill(null).map((_, i) => ({
          id: `order-${offset + i}`,
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          price: 250.0,
          currency: 'USD',
        }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply((uri) => {
          const url = new URL(uri, baseUrl);
          const offset = parseInt(url.searchParams.get('offset') || '0');
          return [200, { success: true, data: createMockOrders(offset) }];
        });

      const page1 = await service.listOrders(conversationId, filters);
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });
      const backToPage1 = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'previous',
      });

      expect(backToPage1.page.index).toBe(1);
      expect(backToPage1.page.offset).toBe(0);
    });

    it('should return to first page using action=first', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        Array(20).fill(null).map((_, i) => ({
          id: `order-${offset + i}`,
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          price: 250.0,
          currency: 'USD',
        }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply((uri) => {
          const url = new URL(uri, baseUrl);
          const offset = parseInt(url.searchParams.get('offset') || '0');
          return [200, { success: true, data: createMockOrders(offset) }];
        });

      const page1 = await service.listOrders(conversationId, filters);
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });
      const backToFirst = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'first',
      });

      expect(backToFirst.page.index).toBe(1);
      expect(backToFirst.page.offset).toBe(0);
    });

    it('should refresh current page using action=current', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const page1 = await service.listOrders(conversationId, filters);
      const refreshed = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'current',
      });

      expect(refreshed.page.offset).toBe(page1.page.offset);
      expect(refreshed.page.index).toBe(page1.page.index);
    });

    it('should navigate using explicit page number', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        Array(20).fill(null).map((_, i) => ({
          id: `order-${offset + i}`,
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          price: 250.0,
          currency: 'USD',
        }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply((uri) => {
          const url = new URL(uri, baseUrl);
          const offset = parseInt(url.searchParams.get('offset') || '0');
          return [200, { success: true, data: createMockOrders(offset) }];
        });

      const page1 = await service.listOrders(conversationId, filters);
      const page3 = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        page: 3,
      });

      expect(page3.page.index).toBe(3);
      expect(page3.page.offset).toBe(40);
    });

    it('should navigate using explicit offset', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.offset === '0')
        .reply(200, { success: true, data: mockOrders });

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.offset === '60')
        .reply(200, { success: true, data: mockOrders });

      const page1 = await service.listOrders(conversationId, filters);
      const page4 = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        offset: 60,
      });

      expect(page4.page.offset).toBe(60);
      expect(page4.page.index).toBe(4);
    });

    it('should prevent negative offset when going to previous from first page', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const page1 = await service.listOrders(conversationId, filters);
      const stillPage1 = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'previous',
      });

      expect(stillPage1.page.offset).toBe(0);
      expect(stillPage1.page.index).toBe(1);
    });
  });

  describe('Order Filtering and Refinement', () => {
    it('should filter orders by status', async () => {
      const filters = { status: 'pending' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'pending', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
        { id: 'order-2', status: 'pending', createdAt: '2024-01-15T10:30:00Z', price: 200, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.status === 'pending')
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.orders.every(o => o.status === 'pending')).toBe(true);
      expect(result.filters.status).toBe('pending');
    });

    it('should filter by date range', async () => {
      const filters = {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.filters.startDate).toBe('2024-01-01');
      expect(result.filters.endDate).toBe('2024-01-31');
    });

    it('should refine filters using refinements parameter', async () => {
      const baseFilters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const result1 = await service.listOrders(conversationId, baseFilters);
      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        refinements: { satellite: 'WorldView-3' },
      });

      expect(result2.filters.status).toBe('completed');
      expect(result2.filters.satellite).toBe('WorldView-3');
    });

    it('should merge direct filters with session filters', async () => {
      const baseFilters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const result1 = await service.listOrders(conversationId, baseFilters);
      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        startDate: '2024-01-01',
      });

      expect(result2.filters.status).toBe('completed');
      expect(result2.filters.startDate).toBe('2024-01-01');
    });

    it('should reset session when reset=true', async () => {
      const filters1 = { status: 'completed' };
      const filters2 = { status: 'pending' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const result1 = await service.listOrders(conversationId, filters1);
      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        reset: true,
        ...filters2,
      });

      expect(result2.sessionId).not.toBe(result1.sessionId);
      expect(result2.filters.status).toBe('pending');
    });
  });

  describe('Page Caching', () => {
    it('should cache fetched pages in session', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply(200, { success: true, data: mockOrders });

      const page1 = await service.listOrders(conversationId, filters);
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages).toHaveLength(3);
    });

    it('should update existing page if same offset is fetched again', async () => {
      const filters = { status: 'completed' };

      const mockOrders1: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      const mockOrders2: Order[] = [
        { id: 'order-1', status: 'delivered', createdAt: '2024-01-15T10:30:00Z', updatedAt: '2024-01-16T10:00:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders1 });

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders2 });

      const page1 = await service.listOrders(conversationId, filters);
      const refreshed = await service.listOrders(conversationId, {
        sessionId: page1.sessionId,
        action: 'current',
      });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages).toHaveLength(1); // Should update, not add
      expect(refreshed.orders[0].status).toBe('delivered');
    });

    it('should maintain page order sorted by offset', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        [{ id: `order-${offset}`, status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' }];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply((uri) => {
          const url = new URL(uri, baseUrl);
          const offset = parseInt(url.searchParams.get('offset') || '0');
          return [200, { success: true, data: createMockOrders(offset) }];
        });

      const page1 = await service.listOrders(conversationId, filters);
      await service.listOrders(conversationId, { sessionId: page1.sessionId, offset: 40 });
      await service.listOrders(conversationId, { sessionId: page1.sessionId, offset: 20 });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages.map(p => p.offset)).toEqual([0, 20, 40]);
    });

    it('should retrieve all orders across all cached pages', async () => {
      const filters = { status: 'completed' };

      const createMockOrders = (offset: number): Order[] =>
        Array(20).fill(null).map((_, i) => ({
          id: `order-${offset + i}`,
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          price: 250.0,
          currency: 'USD',
        }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply((uri) => {
          const url = new URL(uri, baseUrl);
          const offset = parseInt(url.searchParams.get('offset') || '0');
          return [200, { success: true, data: createMockOrders(offset) }];
        });

      const page1 = await service.listOrders(conversationId, filters);
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });
      await service.listOrders(conversationId, { sessionId: page1.sessionId, action: 'next' });

      const allOrders = service.getAllSessionOrders(page1.sessionId);
      expect(allOrders).toHaveLength(60); // 3 pages * 20 orders
    });
  });

  describe('History Tracking', () => {
    it('should track filter history when filters change', async () => {
      const filters1 = { status: 'completed' };
      const filters2 = { status: 'pending' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const result1 = await service.listOrders(conversationId, filters1);
      await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        ...filters2,
      });

      const session = service.getSession(result1.sessionId);
      expect(session?.history.length).toBeGreaterThan(1);
    });

    it('should include history when includeHistory=true', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, {
        ...filters,
        includeHistory: true,
      });

      expect(result.history).toBeDefined();
      expect(Array.isArray(result.history)).toBe(true);
    });

    it('should not include history by default', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.history).toBeUndefined();
    });

    it('should describe filters in history entries', async () => {
      const filters = {
        status: 'completed',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        satellite: 'WorldView-3',
      };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, {
        ...filters,
        includeHistory: true,
      });

      expect(result.history).toBeDefined();
      expect(result.history![0].summary).toContain('Status: completed');
      expect(result.history![0].summary).toContain('Date range');
      expect(result.history![0].summary).toContain('Satellite');
    });
  });

  describe('Session Metadata and Context', () => {
    it('should provide accurate context metadata', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(20).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.context.createdAt).toBeDefined();
      expect(result.context.updatedAt).toBeDefined();
      expect(result.context.storedPages).toBe(1);
      expect(result.context.uniqueOrders).toBe(20);
    });

    it('should update session timestamp on each request', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      const result1 = await service.listOrders(conversationId, filters);
      const createdAt = new Date(result1.context.createdAt);

      await new Promise(resolve => setTimeout(resolve, 10));

      const result2 = await service.listOrders(conversationId, {
        sessionId: result1.sessionId,
        action: 'current',
      });
      const updatedAt = new Date(result2.context.updatedAt);

      expect(updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    });

    it('should build accurate summary messages', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(15).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.summary).toContain('15 order(s)');
      expect(result.summary).toContain('page 1');
      expect(result.summary).toContain('15 unique order(s)');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty results', async () => {
      const filters = { status: 'cancelled' };

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: [] });

      const result = await service.listOrders(conversationId, filters);

      expect(result.orders).toHaveLength(0);
      expect(result.page.hasMore).toBe(false);
      expect(result.page.count).toBe(0);
    });

    it('should detect last page when fewer than limit results returned', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = Array(15).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.page.hasMore).toBe(false);
      expect(result.page.nextOffset).toBeUndefined();
    });

    it('should handle different page sizes', async () => {
      const filters = { status: 'completed', limit: 50 };

      const mockOrders: Order[] = Array(50).fill(null).map((_, i) => ({
        id: `order-${i}`,
        status: 'completed',
        createdAt: '2024-01-15T10:30:00Z',
        price: 250.0,
        currency: 'USD',
      }));

      nock(baseUrl)
        .get('/orders')
        .query((query: any) => query.limit === '50')
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.page.limit).toBe(50);
      expect(result.page.count).toBe(50);
    });

    it('should handle session not found gracefully', async () => {
      const invalidSessionId = 'invalid-session-id';

      await expect(
        service.listOrders(conversationId, { sessionId: invalidSessionId })
      ).rejects.toThrow();
    });

    it('should normalize and filter out empty filter values', async () => {
      const filters = {
        status: 'completed',
        satellite: '',
        startDate: null,
      };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.filters.status).toBe('completed');
      expect(result.filters.satellite).toBeUndefined();
      expect(result.filters.startDate).toBeUndefined();
    });
  });

  describe('Conversation Session Management', () => {
    it('should retrieve all sessions for a conversation', async () => {
      const filters1 = { status: 'completed' };
      const filters2 = { status: 'pending' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(2)
        .reply(200, { success: true, data: mockOrders });

      await service.listOrders(conversationId, filters1);
      await service.listOrders(conversationId, filters2);

      const sessions = service.getConversationSessions(conversationId);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for conversation with no sessions', () => {
      const sessions = service.getConversationSessions('non-existent-conversation');
      expect(sessions).toEqual([]);
    });

    it('should sort conversation sessions by most recent', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .times(3)
        .reply(200, { success: true, data: mockOrders });

      await service.listOrders(conversationId, filters);
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.listOrders(conversationId, { ...filters, status: 'pending' });
      await new Promise(resolve => setTimeout(resolve, 10));
      await service.listOrders(conversationId, { ...filters, status: 'delivered' });

      const sessions = service.getConversationSessions(conversationId);
      const timestamps = sessions.map(s => new Date(s.updatedAt).getTime());

      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });
  });

  describe('Analytics Integration', () => {
    it('should include analytics when available', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        { id: 'order-1', status: 'completed', createdAt: '2024-01-15T10:30:00Z', price: 100, currency: 'USD' },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.analytics).toBeDefined();
      expect(result.analytics?.totalOrders).toBeGreaterThan(0);
    });
  });

  describe('Order Summary Extraction', () => {
    it('should extract all relevant order fields', async () => {
      const filters = { status: 'completed' };

      const mockOrders: Order[] = [
        {
          id: 'order-123',
          status: 'completed',
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-16T10:00:00Z',
          price: 250.0,
          currency: 'USD',
          deliveryUrl: 'https://delivery.skyfi.com/order-123',
          metadata: { archiveId: 'archive-456', satellite: 'WorldView-3' },
        },
      ];

      nock(baseUrl)
        .get('/orders')
        .query(true)
        .reply(200, { success: true, data: mockOrders });

      const result = await service.listOrders(conversationId, filters);

      expect(result.orders[0].id).toBe('order-123');
      expect(result.orders[0].status).toBe('completed');
      expect(result.orders[0].price).toBe(250.0);
      expect(result.orders[0].currency).toBe('USD');
      expect(result.orders[0].deliveryUrl).toBe('https://delivery.skyfi.com/order-123');
      expect(result.orders[0].metadata).toBeDefined();
    });
  });
});
