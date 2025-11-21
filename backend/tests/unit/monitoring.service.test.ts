import { monitoringService } from '../../src/services/monitoring.service';
import { skyfiClient } from '../../src/integrations/skyfi/client';
import * as repository from '../../src/models/monitoring.repository';

jest.mock('../../src/integrations/skyfi/client', () => ({
  skyfiClient: {
    createAoi: jest.fn(),
    createAoiWebhook: jest.fn(),
    deleteAoi: jest.fn(),
    deleteWebhook: jest.fn(),
    updateAoi: jest.fn(),
  },
}));

jest.mock('../../src/models/monitoring.repository', () => ({
  createAoiRecord: jest.fn(),
  listAoisByUser: jest.fn(),
  getAoiById: jest.fn(),
  updateAoiRecord: jest.fn(),
  deactivateAoi: jest.fn(),
  createWebhookRecord: jest.fn(),
  listWebhooksByUser: jest.fn(),
  listWebhooksForAoi: jest.fn(),
  deactivateWebhooksForAoi: jest.fn(),
}));

const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
  ],
};

const baseAoiRecord = {
  id: 'local-aoi',
  userId: 'user-1',
  name: 'Test AOI',
  description: 'Desc',
  geometry: POLYGON,
  criteria: { maxCloudCover: 20 },
  schedule: { frequency: 'weekly' },
  metadata: {},
  skyfiAoiId: 'skyfi-aoi',
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseWebhookRecord = {
  id: 'local-webhook',
  userId: 'user-1',
  aoiId: 'local-aoi',
  url: 'https://example.com/webhook',
  events: ['aoi.data.available'],
  metadata: { skyfiWebhookId: 'skyfi-webhook' },
  skyfiWebhookId: 'skyfi-webhook',
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('MonitoringService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createAoi', () => {
    it('creates AOI and webhook with defaults', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: 'skyfi-aoi',
        metadata: {},
      });
      (repository.createAoiRecord as jest.Mock).mockResolvedValue(baseAoiRecord);
      (skyfiClient.createAoiWebhook as jest.Mock).mockResolvedValue({
        id: 'skyfi-webhook',
      });
      (repository.createWebhookRecord as jest.Mock).mockResolvedValue(baseWebhookRecord);

      const result = await monitoringService.createAoi({
        userId: 'user-1',
        name: 'Test AOI',
        geometry: POLYGON,
        criteria: { maxCloudCover: 20 },
        schedule: { frequency: 'weekly' },
        webhook: {
          url: 'https://example.com/webhook',
        },
      });

      expect(skyfiClient.createAoi).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test AOI',
          geometry: POLYGON,
        })
      );
      expect(skyfiClient.createAoiWebhook).toHaveBeenCalledWith(
        'skyfi-aoi',
        expect.objectContaining({
          url: 'https://example.com/webhook',
          events: ['aoi.data.available'],
        })
      );
      expect(result.webhooks).toHaveLength(1);
      expect(result.webhooks[0].id).toBe('local-webhook');
    });

    it('rolls back SkyFi AOI when repository fails', async () => {
      const deleteAoiMock = skyfiClient.deleteAoi as jest.Mock;
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: 'skyfi-aoi',
        metadata: {},
      });
      (repository.createAoiRecord as jest.Mock).mockRejectedValue(new Error('DB error'));
      deleteAoiMock.mockResolvedValue(undefined);

      await expect(
        monitoringService.createAoi({
          userId: 'user-1',
          name: 'Broken AOI',
          geometry: POLYGON,
        })
      ).rejects.toThrow('DB error');

      expect(deleteAoiMock).toHaveBeenCalledWith('skyfi-aoi');
    });
  });

  describe('listAois', () => {
    it('returns AOIs with grouped webhooks', async () => {
      (repository.listAoisByUser as jest.Mock).mockResolvedValue([baseAoiRecord]);
      (repository.listWebhooksByUser as jest.Mock).mockResolvedValue([baseWebhookRecord]);

      const result = await monitoringService.listAois('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].webhooks).toHaveLength(1);
      expect(repository.listAoisByUser).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateAoi', () => {
    it('updates AOI and syncs with SkyFi', async () => {
      (repository.getAoiById as jest.Mock).mockResolvedValue(baseAoiRecord);
      (skyfiClient.updateAoi as jest.Mock).mockResolvedValue(baseAoiRecord);
      (repository.updateAoiRecord as jest.Mock).mockResolvedValue({
        ...baseAoiRecord,
        name: 'Updated',
      });
      (repository.listWebhooksForAoi as jest.Mock).mockResolvedValue([baseWebhookRecord]);

      const result = await monitoringService.updateAoi('user-1', 'local-aoi', {
        name: 'Updated',
        active: false,
      });

      expect(skyfiClient.updateAoi).toHaveBeenCalledWith(
        'skyfi-aoi',
        expect.objectContaining({ name: 'Updated' })
      );
      expect(repository.updateAoiRecord).toHaveBeenCalledWith(
        expect.objectContaining({ active: false })
      );
      expect(result.name).toBe('Updated');
    });
  });

  describe('deleteAoi', () => {
    it('deactivates AOI and webhooks locally', async () => {
      (repository.getAoiById as jest.Mock).mockResolvedValue(baseAoiRecord);
      (skyfiClient.deleteAoi as jest.Mock).mockResolvedValue(undefined);
      (repository.deactivateAoi as jest.Mock).mockResolvedValue({
        ...baseAoiRecord,
        active: false,
      });
      (repository.deactivateWebhooksForAoi as jest.Mock).mockResolvedValue([
        { ...baseWebhookRecord, active: false },
      ]);

      const result = await monitoringService.deleteAoi('user-1', 'local-aoi');

      expect(skyfiClient.deleteAoi).toHaveBeenCalledWith('skyfi-aoi');
      expect(repository.deactivateAoi).toHaveBeenCalledWith('local-aoi', 'user-1');
      expect(result.active).toBe(false);
      expect(result.webhooks[0].active).toBe(false);
    });
  });
});


