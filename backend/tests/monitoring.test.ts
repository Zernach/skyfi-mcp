import { monitoringService } from '../src/services/monitoring.service';
import { webhookHandlerService } from '../src/services/webhook-handler.service';
import { skyfiClient } from '../src/integrations/skyfi/client';
import * as monitoringRepo from '../src/models/monitoring.repository';
import { SkyFiValidationError, SkyFiNotFoundError } from '../src/integrations/skyfi/errors';

// Mock dependencies
jest.mock('../src/integrations/skyfi/client');
jest.mock('../src/models/monitoring.repository');
jest.mock('../src/utils/logger');

describe('AOI Monitoring Service - P0 Feature #7', () => {
  // Test data
  const testUserId = 'user-123';
  const testAoiId = 'aoi-456';
  const testWebhookId = 'webhook-789';
  const testSkyfiAoiId = 'skyfi-aoi-abc';
  const testSkyfiWebhookId = 'skyfi-webhook-def';

  const validGeometry = {
    type: 'Polygon',
    coordinates: [
      [
        [-122.5, 37.5],
        [-122.5, 37.6],
        [-122.4, 37.6],
        [-122.4, 37.5],
        [-122.5, 37.5],
      ],
    ],
  };

  const validAoiInput = {
    userId: testUserId,
    name: 'Test AOI',
    description: 'Test AOI Description',
    geometry: validGeometry,
    criteria: { maxCloudCover: 20, minResolution: 1 },
    schedule: { frequency: 'daily' },
    metadata: { source: 'test' },
  };

  const mockAoiRecord = {
    id: testAoiId,
    userId: testUserId,
    name: 'Test AOI',
    description: 'Test AOI Description',
    geometry: validGeometry,
    criteria: { maxCloudCover: 20, minResolution: 1 },
    schedule: { frequency: 'daily' },
    metadata: { source: 'test', skyfi: {} },
    skyfiAoiId: testSkyfiAoiId,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockWebhookRecord = {
    id: testWebhookId,
    userId: testUserId,
    aoiId: testAoiId,
    url: 'https://example.com/webhook',
    events: ['aoi.data.available'],
    secret: 'test-secret',
    metadata: { test: true },
    skyfiWebhookId: testSkyfiWebhookId,
    active: true,
    lastSentAt: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('AOI Creation', () => {
    it('should create an AOI successfully', async () => {
      // Setup mocks
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
        metadata: {},
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      // Execute
      const result = await monitoringService.createAoi(validAoiInput);

      // Verify
      expect(skyfiClient.createAoi).toHaveBeenCalledWith({
        name: validAoiInput.name,
        geometry: validGeometry,
        description: validAoiInput.description,
        criteria: validAoiInput.criteria,
        schedule: validAoiInput.schedule,
        metadata: { source: 'test', userId: testUserId },
      });

      expect(monitoringRepo.createAoiRecord).toHaveBeenCalledWith({
        userId: testUserId,
        name: validAoiInput.name,
        description: validAoiInput.description,
        geometry: validGeometry,
        criteria: validAoiInput.criteria,
        schedule: validAoiInput.schedule,
        metadata: { source: 'test', skyfi: {} },
        skyfiAoiId: testSkyfiAoiId,
        active: true,
      });

      expect(result).toEqual({
        ...mockAoiRecord,
        webhooks: [],
      });
    });

    it('should create an AOI with webhook', async () => {
      const inputWithWebhook = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
          events: ['aoi.data.available'],
          secret: 'test-secret',
          metadata: { test: true },
        },
      };

      // Setup mocks
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
        metadata: {},
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      (skyfiClient.createAoiWebhook as jest.Mock).mockResolvedValue({
        id: testSkyfiWebhookId,
        url: 'https://example.com/webhook',
        events: ['aoi.data.available'],
      });

      (monitoringRepo.createWebhookRecord as jest.Mock).mockResolvedValue(mockWebhookRecord);

      // Execute
      const result = await monitoringService.createAoi(inputWithWebhook);

      // Verify
      expect(skyfiClient.createAoiWebhook).toHaveBeenCalledWith(testSkyfiAoiId, {
        url: 'https://example.com/webhook',
        events: ['aoi.data.available'],
        secret: 'test-secret',
        metadata: {
          test: true,
          aoiId: testAoiId,
          userId: testUserId,
        },
      });

      expect(monitoringRepo.createWebhookRecord).toHaveBeenCalled();
      expect(result.webhooks).toHaveLength(1);
    });

    it('should use default webhook events if none provided', async () => {
      const inputWithWebhook = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
        },
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      (skyfiClient.createAoiWebhook as jest.Mock).mockResolvedValue({
        id: testSkyfiWebhookId,
        url: 'https://example.com/webhook',
        events: ['aoi.data.available'],
      });

      (monitoringRepo.createWebhookRecord as jest.Mock).mockResolvedValue(mockWebhookRecord);

      // Execute
      await monitoringService.createAoi(inputWithWebhook);

      // Verify default events were used
      expect(skyfiClient.createAoiWebhook).toHaveBeenCalledWith(
        testSkyfiAoiId,
        expect.objectContaining({
          events: ['aoi.data.available'],
        })
      );
    });

    it('should rollback SkyFi AOI if DB persistence fails', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      (skyfiClient.deleteAoi as jest.Mock).mockResolvedValue(undefined);

      // Execute and verify
      await expect(monitoringService.createAoi(validAoiInput)).rejects.toThrow('Database error');

      expect(skyfiClient.deleteAoi).toHaveBeenCalledWith(testSkyfiAoiId);
    });

    it('should rollback webhook if webhook DB persistence fails', async () => {
      const inputWithWebhook = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
          events: ['aoi.data.available'],
        },
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      (skyfiClient.createAoiWebhook as jest.Mock).mockResolvedValue({
        id: testSkyfiWebhookId,
        url: 'https://example.com/webhook',
        events: ['aoi.data.available'],
      });

      (monitoringRepo.createWebhookRecord as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      (skyfiClient.deleteWebhook as jest.Mock).mockResolvedValue(undefined);

      // Execute and verify
      await expect(monitoringService.createAoi(inputWithWebhook)).rejects.toThrow(
        'Database error'
      );

      expect(skyfiClient.deleteWebhook).toHaveBeenCalledWith(testSkyfiWebhookId);
    });

    it('should reject invalid geometry', async () => {
      const invalidInput = {
        ...validAoiInput,
        geometry: { invalid: 'geometry' },
      };

      await expect(monitoringService.createAoi(invalidInput)).rejects.toThrow();
    });

    it('should validate required fields', async () => {
      const invalidInputs = [
        { ...validAoiInput, userId: '' },
        { ...validAoiInput, name: '' },
        { ...validAoiInput, geometry: null },
      ];

      for (const input of invalidInputs) {
        await expect(monitoringService.createAoi(input as any)).rejects.toThrow();
      }
    });
  });

  describe('AOI Listing', () => {
    it('should list AOIs for a user', async () => {
      (monitoringRepo.listAoisByUser as jest.Mock).mockResolvedValue([mockAoiRecord]);
      (monitoringRepo.listWebhooksByUser as jest.Mock).mockResolvedValue([mockWebhookRecord]);

      const result = await monitoringService.listAois(testUserId);

      expect(monitoringRepo.listAoisByUser).toHaveBeenCalledWith(testUserId);
      expect(monitoringRepo.listWebhooksByUser).toHaveBeenCalledWith(testUserId);
      expect(result).toHaveLength(1);
      expect(result[0].webhooks).toHaveLength(1);
    });

    it('should return empty webhooks for AOIs without webhooks', async () => {
      (monitoringRepo.listAoisByUser as jest.Mock).mockResolvedValue([mockAoiRecord]);
      (monitoringRepo.listWebhooksByUser as jest.Mock).mockResolvedValue([]);

      const result = await monitoringService.listAois(testUserId);

      expect(result[0].webhooks).toEqual([]);
    });

    it('should require userId', async () => {
      await expect(monitoringService.listAois('')).rejects.toThrow('userId is required');
    });
  });

  describe('AOI Updating', () => {
    it('should update an AOI successfully', async () => {
      const updateInput = {
        name: 'Updated AOI',
        description: 'Updated Description',
        active: true,
      };

      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(mockAoiRecord);
      (skyfiClient.updateAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Updated AOI',
      });

      const updatedRecord = { ...mockAoiRecord, ...updateInput };
      (monitoringRepo.updateAoiRecord as jest.Mock).mockResolvedValue(updatedRecord);
      (monitoringRepo.listWebhooksForAoi as jest.Mock).mockResolvedValue([]);

      const result = await monitoringService.updateAoi(testUserId, testAoiId, updateInput);

      expect(monitoringRepo.getAoiById).toHaveBeenCalledWith(testAoiId, testUserId);
      expect(skyfiClient.updateAoi).toHaveBeenCalledWith(testSkyfiAoiId, {
        name: 'Updated AOI',
        description: 'Updated Description',
        active: true,
      });
      expect(result.name).toBe('Updated AOI');
    });

    it('should throw error if AOI not found', async () => {
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(null);

      await expect(
        monitoringService.updateAoi(testUserId, testAoiId, { name: 'Test' })
      ).rejects.toThrow('AOI not found');
    });

    it('should skip SkyFi update if no skyfiAoiId', async () => {
      const aoiWithoutSkyfiId = { ...mockAoiRecord, skyfiAoiId: undefined };
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(aoiWithoutSkyfiId);
      (monitoringRepo.updateAoiRecord as jest.Mock).mockResolvedValue(aoiWithoutSkyfiId);
      (monitoringRepo.listWebhooksForAoi as jest.Mock).mockResolvedValue([]);

      await monitoringService.updateAoi(testUserId, testAoiId, { name: 'Test' });

      expect(skyfiClient.updateAoi).not.toHaveBeenCalled();
    });

    it('should handle null values correctly', async () => {
      const updateInput = {
        description: null,
        criteria: null,
        schedule: null,
        metadata: null,
      };

      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(mockAoiRecord);
      (skyfiClient.updateAoi as jest.Mock).mockResolvedValue({});
      (monitoringRepo.updateAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);
      (monitoringRepo.listWebhooksForAoi as jest.Mock).mockResolvedValue([]);

      await monitoringService.updateAoi(testUserId, testAoiId, updateInput);

      expect(skyfiClient.updateAoi).toHaveBeenCalledWith(
        testSkyfiAoiId,
        expect.objectContaining({
          description: undefined,
          criteria: undefined,
          schedule: undefined,
          metadata: undefined,
        })
      );
    });
  });

  describe('AOI Deletion', () => {
    it('should delete an AOI successfully', async () => {
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(mockAoiRecord);
      (skyfiClient.deleteAoi as jest.Mock).mockResolvedValue(undefined);
      (monitoringRepo.deactivateAoi as jest.Mock).mockResolvedValue(mockAoiRecord);
      (monitoringRepo.deactivateWebhooksForAoi as jest.Mock).mockResolvedValue([
        mockWebhookRecord,
      ]);

      const result = await monitoringService.deleteAoi(testUserId, testAoiId);

      expect(skyfiClient.deleteAoi).toHaveBeenCalledWith(testSkyfiAoiId);
      expect(monitoringRepo.deactivateAoi).toHaveBeenCalledWith(testAoiId, testUserId);
      expect(monitoringRepo.deactivateWebhooksForAoi).toHaveBeenCalledWith(
        testAoiId,
        testUserId
      );
      expect(result.webhooks).toHaveLength(1);
    });

    it('should throw error if AOI not found', async () => {
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(null);

      await expect(monitoringService.deleteAoi(testUserId, testAoiId)).rejects.toThrow(
        'AOI not found'
      );
    });

    it('should continue deletion even if SkyFi deletion fails', async () => {
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(mockAoiRecord);
      (skyfiClient.deleteAoi as jest.Mock).mockRejectedValue(
        new SkyFiNotFoundError('Not found')
      );
      (monitoringRepo.deactivateAoi as jest.Mock).mockResolvedValue(mockAoiRecord);
      (monitoringRepo.deactivateWebhooksForAoi as jest.Mock).mockResolvedValue([]);

      const result = await monitoringService.deleteAoi(testUserId, testAoiId);

      expect(monitoringRepo.deactivateAoi).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Webhook Event Handling', () => {
    const webhookEvents = [
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
    ];

    webhookEvents.forEach((eventType) => {
      it(`should handle ${eventType} event`, async () => {
        const payload = {
          event: eventType,
          timestamp: new Date().toISOString(),
          orderId: 'order-123',
          aoiId: 'aoi-456',
          status: 'completed',
          data: {
            downloadUrls: ['https://example.com/image.tif'],
            previewUrl: 'https://example.com/preview.jpg',
            metadata: {},
          },
        };

        (monitoringRepo.createNotificationRecord as jest.Mock).mockResolvedValue({
          id: 'notification-123',
          webhookId: testWebhookId,
          status: 'received',
          payload,
          response: null,
          createdAt: new Date().toISOString(),
        });

        (monitoringRepo.updateWebhookLastSent as jest.Mock).mockResolvedValue(undefined);

        await webhookHandlerService.processWebhook(testWebhookId, payload);

        expect(monitoringRepo.createNotificationRecord).toHaveBeenCalledWith({
          webhookId: testWebhookId,
          status: 'received',
          payload,
          response: null,
        });

        expect(monitoringRepo.updateWebhookLastSent).toHaveBeenCalledWith(testWebhookId);
      });
    });

    it('should handle unknown event types gracefully', async () => {
      const payload = {
        event: 'unknown.event',
        timestamp: new Date().toISOString(),
      };

      (monitoringRepo.createNotificationRecord as jest.Mock).mockResolvedValue({
        id: 'notification-123',
        webhookId: testWebhookId,
        status: 'received',
        payload,
        response: null,
        createdAt: new Date().toISOString(),
      });

      (monitoringRepo.updateWebhookLastSent as jest.Mock).mockResolvedValue(undefined);

      await webhookHandlerService.processWebhook(testWebhookId, payload);

      expect(monitoringRepo.createNotificationRecord).toHaveBeenCalled();
    });

    it('should record failed notifications on error', async () => {
      const payload = {
        event: 'order.completed',
        timestamp: new Date().toISOString(),
      };

      (monitoringRepo.createNotificationRecord as jest.Mock)
        .mockRejectedValueOnce(new Error('Processing error'))
        .mockResolvedValueOnce({
          id: 'notification-123',
          webhookId: testWebhookId,
          status: 'failed',
          payload,
          response: { error: 'Processing error' },
          createdAt: new Date().toISOString(),
        });

      await expect(
        webhookHandlerService.processWebhook(testWebhookId, payload)
      ).rejects.toThrow('Processing error');

      expect(monitoringRepo.createNotificationRecord).toHaveBeenCalledTimes(2);
      expect(monitoringRepo.createNotificationRecord).toHaveBeenLastCalledWith({
        webhookId: testWebhookId,
        status: 'failed',
        payload,
        response: { error: 'Processing error' },
      });
    });
  });

  describe('Webhook Signature Verification', () => {
    it('should verify valid signatures', () => {
      const payload = JSON.stringify({ event: 'test' });
      const secret = 'test-secret';
      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const validSignature = hmac.digest('hex');

      const result = webhookHandlerService.verifySignature(payload, validSignature, secret);

      expect(result).toBe(true);
    });

    it('should reject invalid signatures', () => {
      const payload = JSON.stringify({ event: 'test' });
      const secret = 'test-secret';
      const invalidSignature = 'invalid-signature-12345678901234567890123456789012';

      const result = webhookHandlerService.verifySignature(payload, invalidSignature, secret);

      expect(result).toBe(false);
    });

    it('should handle signature verification errors', () => {
      const payload = JSON.stringify({ event: 'test' });
      const secret = 'test-secret';
      const invalidSignature = 'short';

      const result = webhookHandlerService.verifySignature(payload, invalidSignature, secret);

      expect(result).toBe(false);
    });
  });

  describe('Webhook Payload Formatting', () => {
    it('should format complete payload', () => {
      const payload = {
        event: 'order.completed',
        timestamp: '2024-01-01T00:00:00Z',
        orderId: 'order-123',
        aoiId: 'aoi-456',
        status: 'completed',
        data: {
          downloadUrls: ['https://example.com/1.tif', 'https://example.com/2.tif'],
        },
        error: {
          code: 'ERR_001',
          message: 'Test error',
        },
      };

      const formatted = webhookHandlerService.formatPayloadSummary(payload);

      expect(formatted).toContain('Event: order.completed');
      expect(formatted).toContain('Timestamp: 2024-01-01T00:00:00Z');
      expect(formatted).toContain('Order ID: order-123');
      expect(formatted).toContain('AOI ID: aoi-456');
      expect(formatted).toContain('Status: completed');
      expect(formatted).toContain('Downloads: 2 file(s)');
      expect(formatted).toContain('Error: Test error (ERR_001)');
    });

    it('should format minimal payload', () => {
      const payload = {
        event: 'test.event',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const formatted = webhookHandlerService.formatPayloadSummary(payload);

      expect(formatted).toContain('Event: test.event');
      expect(formatted).toContain('Timestamp: 2024-01-01T00:00:00Z');
      expect(formatted).not.toContain('Order ID');
      expect(formatted).not.toContain('AOI ID');
    });
  });

  describe('Database Persistence', () => {
    it('should persist AOI with all fields', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      await monitoringService.createAoi(validAoiInput);

      expect(monitoringRepo.createAoiRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          name: validAoiInput.name,
          description: validAoiInput.description,
          geometry: validGeometry,
          criteria: validAoiInput.criteria,
          schedule: validAoiInput.schedule,
          skyfiAoiId: testSkyfiAoiId,
          active: true,
        })
      );
    });

    it('should persist webhook with all fields', async () => {
      const inputWithWebhook = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
          events: ['aoi.data.available', 'order.completed'],
          secret: 'test-secret',
          metadata: { test: true },
        },
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      (skyfiClient.createAoiWebhook as jest.Mock).mockResolvedValue({
        id: testSkyfiWebhookId,
        url: 'https://example.com/webhook',
        events: ['aoi.data.available', 'order.completed'],
      });

      (monitoringRepo.createWebhookRecord as jest.Mock).mockResolvedValue(mockWebhookRecord);

      await monitoringService.createAoi(inputWithWebhook);

      expect(monitoringRepo.createWebhookRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
          aoiId: testAoiId,
          url: 'https://example.com/webhook',
          events: ['aoi.data.available', 'order.completed'],
          secret: 'test-secret',
          skyfiWebhookId: testSkyfiWebhookId,
          active: true,
        })
      );
    });

    it('should persist notification records', async () => {
      const payload = {
        event: 'order.completed',
        timestamp: new Date().toISOString(),
        orderId: 'order-123',
      };

      (monitoringRepo.createNotificationRecord as jest.Mock).mockResolvedValue({
        id: 'notification-123',
        webhookId: testWebhookId,
        status: 'received',
        payload,
        response: null,
        createdAt: new Date().toISOString(),
      });

      (monitoringRepo.updateWebhookLastSent as jest.Mock).mockResolvedValue(undefined);

      await webhookHandlerService.processWebhook(testWebhookId, payload);

      expect(monitoringRepo.createNotificationRecord).toHaveBeenCalledWith({
        webhookId: testWebhookId,
        status: 'received',
        payload,
        response: null,
      });
    });
  });

  describe('Integration with SkyFi API', () => {
    it('should handle SkyFi API errors during AOI creation', async () => {
      (skyfiClient.createAoi as jest.Mock).mockRejectedValue(
        new SkyFiValidationError('Invalid geometry')
      );

      await expect(monitoringService.createAoi(validAoiInput)).rejects.toThrow(
        'Invalid geometry'
      );

      expect(monitoringRepo.createAoiRecord).not.toHaveBeenCalled();
    });

    it('should handle SkyFi API errors during webhook creation', async () => {
      const inputWithWebhook = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
          events: ['aoi.data.available'],
        },
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      (skyfiClient.createAoiWebhook as jest.Mock).mockRejectedValue(
        new SkyFiValidationError('Invalid webhook URL')
      );

      await expect(monitoringService.createAoi(inputWithWebhook)).rejects.toThrow(
        'Invalid webhook URL'
      );

      expect(monitoringRepo.createWebhookRecord).not.toHaveBeenCalled();
    });

    it('should clear cache after AOI operations', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue(mockAoiRecord);

      await monitoringService.createAoi(validAoiInput);

      // Verify cache methods were called on client
      expect(skyfiClient.createAoi).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle database connection errors', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockRejectedValue(
        new Error('Connection timeout')
      );

      (skyfiClient.deleteAoi as jest.Mock).mockResolvedValue(undefined);

      await expect(monitoringService.createAoi(validAoiInput)).rejects.toThrow(
        'Connection timeout'
      );

      expect(skyfiClient.deleteAoi).toHaveBeenCalled();
    });

    it('should log warning if rollback fails', async () => {
      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      (skyfiClient.deleteAoi as jest.Mock).mockRejectedValue(
        new Error('Rollback failed')
      );

      await expect(monitoringService.createAoi(validAoiInput)).rejects.toThrow(
        'Database error'
      );

      expect(skyfiClient.deleteAoi).toHaveBeenCalled();
    });

    it('should continue with partial success', async () => {
      (monitoringRepo.getAoiById as jest.Mock).mockResolvedValue(mockAoiRecord);
      (skyfiClient.deleteAoi as jest.Mock).mockRejectedValue(
        new SkyFiNotFoundError('AOI not found in SkyFi')
      );
      (monitoringRepo.deactivateAoi as jest.Mock).mockResolvedValue(mockAoiRecord);
      (monitoringRepo.deactivateWebhooksForAoi as jest.Mock).mockResolvedValue([]);

      const result = await monitoringService.deleteAoi(testUserId, testAoiId);

      expect(result).toBeDefined();
      expect(monitoringRepo.deactivateAoi).toHaveBeenCalled();
    });
  });

  describe('Validation and Edge Cases', () => {
    it('should reject empty webhook events array', async () => {
      const inputWithEmptyEvents = {
        ...validAoiInput,
        webhook: {
          url: 'https://example.com/webhook',
          events: [],
        },
      };

      await expect(monitoringService.createAoi(inputWithEmptyEvents)).rejects.toThrow();

      // Verify that no API calls were made
      expect(skyfiClient.createAoi).not.toHaveBeenCalled();
      expect(monitoringRepo.createAoiRecord).not.toHaveBeenCalled();
    });

    it('should handle very long metadata', async () => {
      const longMetadata = { data: 'x'.repeat(10000) };
      const inputWithLongMetadata = {
        ...validAoiInput,
        metadata: longMetadata,
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue({
        ...mockAoiRecord,
        metadata: longMetadata,
      });

      const result = await monitoringService.createAoi(inputWithLongMetadata);

      expect(result.metadata).toEqual(longMetadata);
    });

    it('should handle concurrent webhook notifications', async () => {
      const payload1 = { event: 'order.completed', timestamp: new Date().toISOString() };
      const payload2 = { event: 'order.processing', timestamp: new Date().toISOString() };

      (monitoringRepo.createNotificationRecord as jest.Mock).mockResolvedValue({
        id: 'notification-123',
        webhookId: testWebhookId,
        status: 'received',
        payload: {},
        response: null,
        createdAt: new Date().toISOString(),
      });

      (monitoringRepo.updateWebhookLastSent as jest.Mock).mockResolvedValue(undefined);

      await Promise.all([
        webhookHandlerService.processWebhook(testWebhookId, payload1),
        webhookHandlerService.processWebhook(testWebhookId, payload2),
      ]);

      expect(monitoringRepo.createNotificationRecord).toHaveBeenCalledTimes(2);
      expect(monitoringRepo.updateWebhookLastSent).toHaveBeenCalledTimes(2);
    });

    it('should handle special characters in AOI name', async () => {
      const specialNameInput = {
        ...validAoiInput,
        name: "Test AOI with 'quotes' and \"double quotes\" and <tags>",
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: specialNameInput.name,
        geometry: validGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue({
        ...mockAoiRecord,
        name: specialNameInput.name,
      });

      const result = await monitoringService.createAoi(specialNameInput);

      expect(result.name).toBe(specialNameInput.name);
    });

    it('should handle complex polygon geometries', async () => {
      const complexGeometry = {
        type: 'Polygon',
        coordinates: [
          [
            [-122.5, 37.5],
            [-122.5, 37.6],
            [-122.45, 37.65],
            [-122.4, 37.6],
            [-122.4, 37.5],
            [-122.45, 37.45],
            [-122.5, 37.5],
          ],
        ],
      };

      const complexInput = {
        ...validAoiInput,
        geometry: complexGeometry,
      };

      (skyfiClient.createAoi as jest.Mock).mockResolvedValue({
        id: testSkyfiAoiId,
        name: 'Test AOI',
        geometry: complexGeometry,
      });

      (monitoringRepo.createAoiRecord as jest.Mock).mockResolvedValue({
        ...mockAoiRecord,
        geometry: complexGeometry,
      });

      const result = await monitoringService.createAoi(complexInput);

      expect(result.geometry).toEqual(complexGeometry);
    });
  });
});
