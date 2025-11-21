import request from 'supertest';
import { createApp } from '../../src/app';
import { monitoringService } from '../../src/services/monitoring.service';

jest.mock('../../src/services/monitoring.service', () => ({
  monitoringService: {
    listAois: jest.fn(),
    createAoi: jest.fn(),
    updateAoi: jest.fn(),
    deleteAoi: jest.fn(),
  },
}));

const mockedService = monitoringService as jest.Mocked<typeof monitoringService>;

describe('Monitoring API', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/monitoring/aois', () => {
    it('requires userId query param', async () => {
      const response = await request(app).get('/api/v1/monitoring/aois');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('returns AOIs from service', async () => {
      mockedService.listAois.mockResolvedValue([
        {
          id: 'aoi-1',
          userId: 'user-1',
          name: 'Test',
          geometry: {},
          active: true,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          webhooks: [],
        } as any,
      ]);

      const response = await request(app)
        .get('/api/v1/monitoring/aois')
        .query({ userId: 'user-1' });

      expect(response.status).toBe(200);
      expect(response.body.aois).toHaveLength(1);
      expect(mockedService.listAois).toHaveBeenCalledWith('user-1');
    });
  });

  describe('POST /api/v1/monitoring/aois', () => {
    it('creates AOI via service', async () => {
      mockedService.createAoi.mockResolvedValue({
        id: 'aoi-1',
        userId: 'user-1',
        name: 'Created',
        geometry: {},
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        webhooks: [],
      } as any);

      const payload = {
        userId: 'user-1',
        name: 'Created',
        geometry: {
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
        },
      };

      const response = await request(app)
        .post('/api/v1/monitoring/aois')
        .send(payload);

      expect(response.status).toBe(201);
      expect(mockedService.createAoi).toHaveBeenCalledWith(payload);
    });
  });

  describe('PUT /api/v1/monitoring/aois/:id', () => {
    it('requires userId in body', async () => {
      const response = await request(app)
        .put('/api/v1/monitoring/aois/aoi-1')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('updates AOI via service', async () => {
      mockedService.updateAoi.mockResolvedValue({
        id: 'aoi-1',
        userId: 'user-1',
        name: 'Updated',
        geometry: {},
        active: true,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        webhooks: [],
      } as any);

      const response = await request(app)
        .put('/api/v1/monitoring/aois/aoi-1')
        .send({ userId: 'user-1', name: 'Updated' });

      expect(response.status).toBe(200);
      expect(mockedService.updateAoi).toHaveBeenCalledWith('user-1', 'aoi-1', {
        name: 'Updated',
      });
    });
  });

  describe('DELETE /api/v1/monitoring/aois/:id', () => {
    it('requires userId', async () => {
      const response = await request(app).delete('/api/v1/monitoring/aois/aoi-1');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('deletes AOI via service', async () => {
      mockedService.deleteAoi.mockResolvedValue({
        id: 'aoi-1',
        userId: 'user-1',
        name: 'Updated',
        geometry: {},
        active: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        webhooks: [],
      } as any);

      const response = await request(app)
        .delete('/api/v1/monitoring/aois/aoi-1')
        .query({ userId: 'user-1' });

      expect(response.status).toBe(200);
      expect(mockedService.deleteAoi).toHaveBeenCalledWith('user-1', 'aoi-1');
    });
  });
});


