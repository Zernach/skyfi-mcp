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

import { orderHistoryService } from '../../src/services/order-history.service';
import { skyfiClient } from '../../src/integrations/skyfi/client';

const mockListOrders = skyfiClient.listOrders as jest.Mock;

describe('OrderHistoryService', () => {
  beforeEach(() => {
    orderHistoryService.reset();
    mockListOrders.mockReset();
  });

  it('initializes a new order session and returns orders', async () => {
    mockListOrders.mockResolvedValue([
      {
        id: 'order-1',
        status: 'completed',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
        price: 250,
        currency: 'USD',
        deliveryUrl: 'https://example.com/download/order-1',
      },
    ]);

    const response = await orderHistoryService.listOrders('conv-1', {
      status: 'completed',
      limit: 10,
    });

    expect(response.success).toBe(true);
    expect(response.orders).toHaveLength(1);
    expect(response.orders[0].deliveryUrl).toContain('order-1');
    expect(response.page.index).toBe(1);
    expect(response.page.hasMore).toBe(false);
    expect(response.sessionId).toBeTruthy();
  });

  it('continues existing session with next page navigation', async () => {
    mockListOrders
      .mockResolvedValueOnce([
        {
          id: 'order-1',
          status: 'completed',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'order-2',
          status: 'processing',
          createdAt: '2024-01-03T00:00:00Z',
        },
      ]);

    const firstResponse = await orderHistoryService.listOrders('conv-2', {
      status: 'completed',
      limit: 1,
    });

    const secondResponse = await orderHistoryService.listOrders('conv-2', {
      sessionId: firstResponse.sessionId,
      action: 'next',
      limit: 1,
    });

    expect(secondResponse.page.index).toBe(2);
    expect(secondResponse.orders[0].id).toBe('order-2');
    expect(secondResponse.context.uniqueOrders).toBe(2);
    expect(mockListOrders).toHaveBeenLastCalledWith({
      status: 'completed',
      limit: 1,
      offset: 1,
    });
  });
});


