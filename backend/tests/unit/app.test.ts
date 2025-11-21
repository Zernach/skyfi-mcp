import request from 'supertest';
import { createApp } from '../../src/app';

describe('App', () => {
    const app = createApp();

    describe('GET /health', () => {
        it('should return 200 and health status', async () => {
            const response = await request(app).get('/health');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('version');
        });
    });

    describe('GET /api/v1', () => {
        it('should return API information', async () => {
            const response = await request(app).get('/api/v1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('version');
            expect(response.body).toHaveProperty('endpoints');
        });
    });

    describe('GET /nonexistent', () => {
        it('should return 404 for unknown routes', async () => {
            const response = await request(app).get('/nonexistent');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Not Found');
        });
    });
});
