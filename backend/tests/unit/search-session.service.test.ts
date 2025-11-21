import { randomUUID } from 'crypto';

jest.mock('../../src/integrations/skyfi/client', () => {
  const archiveSearch = jest.fn();
  const listOrders = jest.fn();
  return {
    skyfiClient: {
      archiveSearch,
      listOrders,
    },
  };
});

import { searchSessionService } from '../../src/services/search-session.service';
import { skyfiClient } from '../../src/integrations/skyfi/client';

const mockArchiveSearch = skyfiClient.archiveSearch as jest.Mock;

describe('SearchSessionService', () => {
  beforeEach(() => {
    searchSessionService.reset();
    mockArchiveSearch.mockReset();
  });

  it('creates a new search session and returns first page metadata', async () => {
    mockArchiveSearch.mockResolvedValue({
      results: [
        {
          id: randomUUID(),
          captureDate: '2024-01-01T00:00:00Z',
          resolution: 0.5,
          cloudCover: 10,
          satellite: 'TestSat-1',
          price: 100,
          bbox: [0, 0, 1, 1],
        },
        {
          id: randomUUID(),
          captureDate: '2024-01-02T00:00:00Z',
          resolution: 0.4,
          cloudCover: 5,
          satellite: 'TestSat-2',
          price: 120,
          bbox: [1, 1, 2, 2],
        },
      ],
      total: 4,
      limit: 2,
      offset: 0,
    });

    const response = await searchSessionService.runArchiveSearch('conv-1', {
      location: { type: 'Point', coordinates: [2, 48] },
      limit: 2,
    });

    expect(response.success).toBe(true);
    expect(response.sessionId).toBeTruthy();
    expect(response.page.index).toBe(1);
    expect(response.page.count).toBe(2);
    expect(response.page.hasMore).toBe(true);
    expect(response.results).toHaveLength(2);
  });

  it('continues an existing session when requesting the next page', async () => {
    const firstPageResults = [
      {
        id: randomUUID(),
        captureDate: '2024-01-01T00:00:00Z',
        resolution: 0.5,
        cloudCover: 10,
        satellite: 'TestSat-1',
        price: 100,
        bbox: [0, 0, 1, 1],
      },
      {
        id: randomUUID(),
        captureDate: '2024-01-02T00:00:00Z',
        resolution: 0.4,
        cloudCover: 5,
        satellite: 'TestSat-2',
        price: 120,
        bbox: [1, 1, 2, 2],
      },
    ];
    const secondPageResults = [
      {
        id: randomUUID(),
        captureDate: '2024-01-03T00:00:00Z',
        resolution: 0.6,
        cloudCover: 12,
        satellite: 'TestSat-3',
        price: 130,
        bbox: [2, 2, 3, 3],
      },
    ];

    mockArchiveSearch
      .mockResolvedValueOnce({
        results: firstPageResults,
        total: 3,
        limit: 2,
        offset: 0,
      })
      .mockResolvedValueOnce({
        results: secondPageResults,
        total: 3,
        limit: 2,
        offset: 2,
      });

    const firstResponse = await searchSessionService.runArchiveSearch('conv-42', {
      location: { type: 'Point', coordinates: [10, 10] },
      limit: 2,
    });

    const secondResponse = await searchSessionService.runArchiveSearch('conv-42', {
      sessionId: firstResponse.sessionId,
      action: 'next',
    });

    expect(secondResponse.page.index).toBe(2);
    expect(secondResponse.page.count).toBe(1);
    expect(secondResponse.page.hasMore).toBe(false);
    expect(secondResponse.results[0].id).toBe(secondPageResults[0].id);
    expect(mockArchiveSearch).toHaveBeenCalledTimes(2);
    expect(mockArchiveSearch.mock.calls[1][0]).toMatchObject({
      limit: 2,
      offset: 2,
    });
  });
});


