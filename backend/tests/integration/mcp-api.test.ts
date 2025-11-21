import request from 'supertest';
import { createApp } from '../../src/app';

describe('MCP API Endpoints', () => {
  const app = createApp();

  describe('POST /mcp/message', () => {
    it('should handle valid MCP request', async () => {
      const response = await request(app)
        .post('/mcp/message')
        .send({
          jsonrpc: '2.0',
          method: 'ping',
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('id', 1);
      expect(response.body.result).toHaveProperty('pong', true);
    });

    it('should return error for invalid request', async () => {
      const response = await request(app)
        .post('/mcp/message')
        .send({
          jsonrpc: '1.0',
          method: 'ping',
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe(-32600);
    });

    it('should return error for method not found', async () => {
      const response = await request(app)
        .post('/mcp/message')
        .send({
          jsonrpc: '2.0',
          method: 'unknownMethod',
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe(-32601);
    });

    it('should list available methods', async () => {
      const response = await request(app)
        .post('/mcp/message')
        .send({
          jsonrpc: '2.0',
          method: 'listMethods',
          id: 1,
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toHaveProperty('methods');
      expect(response.body.result.methods).toContain('ping');
      expect(response.body.result.methods).toContain('listMethods');
    });
  });

  describe('GET /mcp/status', () => {
    it('should return MCP server status', async () => {
      const response = await request(app).get('/mcp/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'online');
      expect(response.body).toHaveProperty('connections');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('protocol');
    });
  });

  describe('GET /mcp/sse', () => {
    it('should establish SSE connection', (done) => {
      const req = request(app).get('/mcp/sse?clientId=test-client');

      req.on('response', (res) => {
        expect(res.headers['content-type']).toBe('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['connection']).toBe('keep-alive');

        // Close the connection after a short delay
        setTimeout(() => {
          req.abort();
          done();
        }, 100);
      });
    });
  });
});
