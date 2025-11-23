import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import nock from 'nock';
import { SearchSessionService, SearchCriteria } from '../src/services/search-session.service';
import { ArchiveSearchResponse } from '../src/integrations/skyfi/types';

// Mock the skyfi client module
const mockClient = {
  archiveSearch: jest.fn(),
  clearCache: jest.fn(),
} as any;

jest.mock('../src/integrations/skyfi/client', () => ({
  skyfiClient: mockClient,
}));

describe('SearchSessionService - P0 Feature #6: Iterative Data Search', () => {
  let service: SearchSessionService;
  const conversationId = 'test-conversation-123';
  const baseUrl = 'https://api.test.skyfi.com';

  beforeEach(() => {
    service = new SearchSessionService();
    service.reset();
    jest.clearAllMocks();
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
    service.reset();
    jest.clearAllMocks();
  });

  describe('Session Creation and Management', () => {
    it('should create a new session on first search', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        maxCloudCoverage: 20,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset: 0,
      };

      (mockClient.archiveSearch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await service.runArchiveSearch(conversationId, criteria);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.page.index).toBe(1);
      expect(result.page.count).toBe(20);
      expect(result.page.total).toBe(100);
      expect(result.page.hasMore).toBe(true);
      expect(result.results).toHaveLength(20);
      expect(result.context.storedPages).toBe(1);
      expect(result.context.storedResults).toBe(20);
    });

    it('should reuse existing session when sessionId is provided', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 20,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      // First search creates session
      const firstResult = await service.runArchiveSearch(conversationId, criteria);
      const sessionId = firstResult.sessionId;

      // Second search reuses session
      const secondResult = await service.runArchiveSearch(conversationId, {
        sessionId,
        action: 'next',
      });

      expect(secondResult.sessionId).toBe(sessionId);
      expect(secondResult.page.index).toBe(2);
    });

    it('should track multiple sessions per conversation', async () => {
      const criteria1: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 20,
      };

      const criteria2: SearchCriteria = {
        location: { type: 'Point', coordinates: [-73.935242, 40.730610] },
        minResolution: 1,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 1,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      await service.runArchiveSearch(conversationId, criteria1);
      await service.runArchiveSearch(conversationId, criteria2);

      const sessions = service.getConversationSessions(conversationId);
      expect(sessions).toHaveLength(2);
    });

    it('should throw error when no criteria provided for new session', async () => {
      await expect(
        service.runArchiveSearch(conversationId, {})
      ).rejects.toThrow('Archive search requires at least one search parameter');
    });
  });

  describe('Pagination - Next/Previous/First/Current Actions', () => {
    it('should navigate to next page using action=next', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${offset + i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.offset === 0)
        .reply(200, { success: true, data: createMockResponse(0) });

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.offset === 20)
        .reply(200, { success: true, data: createMockResponse(20) });

      // Page 1
      const page1 = await service.runArchiveSearch(conversationId, criteria);
      expect(page1.page.index).toBe(1);
      expect(page1.page.offset).toBe(0);
      expect(page1.results[0].id).toBe('result-0');

      // Page 2
      const page2 = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'next',
      });
      expect(page2.page.index).toBe(2);
      expect(page2.page.offset).toBe(20);
      expect(page2.results[0].id).toBe('result-20');
    });

    it('should navigate to previous page using action=previous', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${offset + i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search')
        .times(3)
        .reply((_uri, body: any) => {
          return [200, { success: true, data: createMockResponse(body.offset || 0) }];
        });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'next',
      });
      const backToPage1 = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'previous',
      });

      expect(backToPage1.page.index).toBe(1);
      expect(backToPage1.page.offset).toBe(0);
    });

    it('should return to first page using action=first', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${offset + i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search')
        .times(3)
        .reply((_uri, body: any) => {
          return [200, { success: true, data: createMockResponse(body.offset || 0) }];
        });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, action: 'next' });
      const backToFirst = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'first',
      });

      expect(backToFirst.page.index).toBe(1);
      expect(backToFirst.page.offset).toBe(0);
    });

    it('should refresh current page using action=current', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 20,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      const refreshed = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'current',
      });

      expect(refreshed.page.offset).toBe(page1.page.offset);
      expect(refreshed.page.index).toBe(page1.page.index);
    });

    it('should navigate using explicit page number', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${offset + i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15T10:30:00Z',
          cloudCover: 15,
          resolution: 0.31,
          bbox: [-122.5, 37.7, -122.3, 38.0],
          price: 250.0,
        })),
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply((_uri, body: any) => {
          return [200, { success: true, data: createMockResponse(body.offset || 0) }];
        });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      const page3 = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        page: 3,
      });

      expect(page3.page.index).toBe(3);
      expect(page3.page.offset).toBe(40);
    });

    it('should navigate using explicit offset', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(20).fill(null).map((_, i) => ({ id: `result-${i}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 })),
        total: 100,
        limit: 20,
        offset: 60,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.offset === 0)
        .reply(200, { success: true, data: { ...mockResponse, offset: 0 } });

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.offset === 60)
        .reply(200, { success: true, data: mockResponse });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      const page4 = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        offset: 60,
      });

      expect(page4.page.offset).toBe(60);
      expect(page4.page.index).toBe(4);
    });

    it('should prevent negative offset when going to previous from first page', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 20,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      const stillPage1 = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'previous',
      });

      expect(stillPage1.page.offset).toBe(0);
      expect(stillPage1.page.index).toBe(1);
    });
  });

  describe('Page Caching (Max 20 Pages)', () => {
    it('should cache fetched pages in session', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 100,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(3)
        .reply(200, { success: true, data: mockResponse });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, action: 'next' });
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, action: 'next' });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages).toHaveLength(3);
    });

    it('should update existing page if same offset is fetched again', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse1: ArchiveSearchResponse = {
        results: [{ id: 'result-1', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 100,
        limit: 20,
        offset: 0,
      };

      const mockResponse2: ArchiveSearchResponse = {
        results: [{ id: 'result-2-updated', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 5, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 100,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse1 });

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse2 });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      const refreshed = await service.runArchiveSearch(conversationId, {
        sessionId: page1.sessionId,
        action: 'current',
      });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages).toHaveLength(1); // Should update, not add
      expect(refreshed.results[0].id).toBe('result-2-updated');
    });

    it('should maintain page order sorted by offset', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: [{ id: `result-${offset}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search')
        .times(3)
        .reply((_uri, body: any) => {
          return [200, { success: true, data: createMockResponse(body.offset || 0) }];
        });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      // Jump to page 3
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, offset: 40 });
      // Then page 2
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, offset: 20 });

      const session = service.getSession(page1.sessionId);
      expect(session?.pages.map(p => p.offset)).toEqual([0, 20, 40]);
    });

    it('should store all results across pages', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const createMockResponse = (offset: number): ArchiveSearchResponse => ({
        results: Array(20).fill(null).map((_, i) => ({
          id: `result-${offset + i}`,
          satellite: 'WorldView-3',
          captureDate: '2024-01-15',
          cloudCover: 10,
          resolution: 0.5,
          bbox: [0,0,0,0],
          price: 100,
        })),
        total: 100,
        limit: 20,
        offset,
      });

      nock(baseUrl)
        .post('/archive/search')
        .times(3)
        .reply((_uri, body: any) => {
          return [200, { success: true, data: createMockResponse(body.offset || 0) }];
        });

      const page1 = await service.runArchiveSearch(conversationId, criteria);
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, action: 'next' });
      await service.runArchiveSearch(conversationId, { sessionId: page1.sessionId, action: 'next' });

      const allResults = service.getAllSessionResults(page1.sessionId);
      expect(allResults).toHaveLength(60); // 3 pages * 20 results
    });
  });

  describe('Search History Tracking', () => {
    it('should track search history when criteria changes', async () => {
      const criteria1: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 20,
      };

      const criteria2: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 10, // Changed
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const result1 = await service.runArchiveSearch(conversationId, criteria1);
      await service.runArchiveSearch(conversationId, {
        sessionId: result1.sessionId,
        ...criteria2,
      });

      const session = service.getSession(result1.sessionId);
      expect(session?.history.length).toBeGreaterThan(1);
    });

    it('should include history when includeHistory=true', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, {
        ...criteria,
        includeHistory: true,
      });

      expect(result.history).toBeDefined();
      expect(Array.isArray(result.history)).toBe(true);
    });

    it('should not include history by default', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      expect(result.history).toBeUndefined();
    });

    it('should describe criteria in history entries', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        maxCloudCoverage: 20,
        minResolution: 1,
        satellites: ['WorldView-3', 'Sentinel-2A'],
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, {
        ...criteria,
        includeHistory: true,
      });

      expect(result.history).toBeDefined();
      expect(result.history![0].summary).toContain('Location specified');
      expect(result.history![0].summary).toContain('Date range');
      expect(result.history![0].summary).toContain('Cloud cover');
      expect(result.history![0].summary).toContain('Resolution');
      expect(result.history![0].summary).toContain('Satellites');
    });
  });

  describe('Search Refinement', () => {
    it('should refine search criteria using refinements parameter', async () => {
      const baseCriteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 50,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.maxCloudCoverage === 50)
        .reply(200, { success: true, data: mockResponse });

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.maxCloudCoverage === 20)
        .reply(200, { success: true, data: mockResponse });

      const result1 = await service.runArchiveSearch(conversationId, baseCriteria);
      const result2 = await service.runArchiveSearch(conversationId, {
        sessionId: result1.sessionId,
        refinements: { maxCloudCoverage: 20 },
      });

      expect(result2.criteria.maxCloudCoverage).toBe(20);
    });

    it('should merge direct criteria with session criteria', async () => {
      const baseCriteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const result1 = await service.runArchiveSearch(conversationId, baseCriteria);
      const result2 = await service.runArchiveSearch(conversationId, {
        sessionId: result1.sessionId,
        maxCloudCoverage: 15,
      });

      expect(result2.criteria.location).toBeDefined();
      expect(result2.criteria.maxCloudCoverage).toBe(15);
    });

    it('should reset session when reset=true', async () => {
      const criteria1: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 20,
      };

      const criteria2: SearchCriteria = {
        location: { type: 'Point', coordinates: [-73.935242, 40.730610] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const result1 = await service.runArchiveSearch(conversationId, criteria1);
      const result2 = await service.runArchiveSearch(conversationId, {
        sessionId: result1.sessionId,
        reset: true,
        ...criteria2,
      });

      expect(result2.sessionId).not.toBe(result1.sessionId);
      expect(result2.criteria.maxCloudCoverage).toBeUndefined();
    });
  });

  describe('Session Metadata and Context', () => {
    it('should provide accurate context metadata', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(20).fill(null).map((_, i) => ({ id: `result-${i}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 })),
        total: 100,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      expect(result.context.createdAt).toBeDefined();
      expect(result.context.updatedAt).toBeDefined();
      expect(result.context.storedPages).toBe(1);
      expect(result.context.storedResults).toBe(20);
    });

    it('should update session timestamp on each search', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      const result1 = await service.runArchiveSearch(conversationId, criteria);
      const createdAt = new Date(result1.context.createdAt);

      await new Promise(resolve => setTimeout(resolve, 10));

      const result2 = await service.runArchiveSearch(conversationId, {
        sessionId: result1.sessionId,
        action: 'current',
      });
      const updatedAt = new Date(result2.context.updatedAt);

      expect(updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    });

    it('should build accurate summary messages', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(15).fill(null).map((_, i) => ({ id: `result-${i}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 })),
        total: 75,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      expect(result.summary).toContain('15 result(s)');
      expect(result.summary).toContain('out of 75');
      expect(result.summary).toContain('page 1');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty results', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [],
        total: 0,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      expect(result.results).toHaveLength(0);
      expect(result.page.hasMore).toBe(false);
      expect(result.page.count).toBe(0);
    });

    it('should handle last page correctly', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(15).fill(null).map((_, i) => ({ id: `result-${i}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 })),
        total: 35,
        limit: 20,
        offset: 20,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, {
        ...criteria,
        offset: 20,
      });

      expect(result.page.hasMore).toBe(false);
      expect(result.page.nextOffset).toBeUndefined();
    });

    it('should handle different page sizes', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: Array(50).fill(null).map((_, i) => ({ id: `result-${i}`, satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 })),
        total: 100,
        limit: 50,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search', (body: any) => body.limit === 50)
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, {
        ...criteria,
        limit: 50,
      });

      expect(result.page.limit).toBe(50);
      expect(result.page.count).toBe(50);
    });

    it('should handle session not found gracefully', async () => {
      const invalidSessionId = 'invalid-session-id';

      await expect(
        service.runArchiveSearch(conversationId, { sessionId: invalidSessionId })
      ).rejects.toThrow();
    });
  });

  describe('Conversation Session Management', () => {
    it('should retrieve all sessions for a conversation', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .times(2)
        .reply(200, { success: true, data: mockResponse });

      await service.runArchiveSearch(conversationId, criteria);
      await service.runArchiveSearch(conversationId, { ...criteria, maxCloudCoverage: 10 });

      const sessions = service.getConversationSessions(conversationId);
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for conversation with no sessions', () => {
      const sessions = service.getConversationSessions('non-existent-conversation');
      expect(sessions).toEqual([]);
    });
  });

  describe('Analytics and Recommendations Integration', () => {
    it('should provide recommendations when results are low', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
        maxCloudCoverage: 5,
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [],
        total: 0,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      // Recommendations should be included for low/no results
      expect(result.recommendations).toBeDefined();
    });

    it('should include analytics when available', async () => {
      const criteria: SearchCriteria = {
        location: { type: 'Point', coordinates: [-122.4194, 37.7749] },
      };

      const mockResponse: ArchiveSearchResponse = {
        results: [{ id: 'test', satellite: 'WorldView-3', captureDate: '2024-01-15', cloudCover: 10, resolution: 0.5, bbox: [0,0,0,0], price: 100 }],
        total: 10,
        limit: 20,
        offset: 0,
      };

      nock(baseUrl)
        .post('/archive/search')
        .reply(200, { success: true, data: mockResponse });

      const result = await service.runArchiveSearch(conversationId, criteria);

      // Analytics included after first search
      expect(result.analytics).toBeDefined();
      expect(result.analytics?.totalSearches).toBeGreaterThan(0);
    });
  });
});
