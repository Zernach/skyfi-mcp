import { handleMCPRequest } from '../../src/mcp/handler';
import { mcpRouter } from '../../src/mcp/router';
import { MCPErrorCode } from '../../src/mcp/types';

describe('MCP Protocol', () => {
  describe('handleMCPRequest', () => {
    it('should handle valid ping request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'ping',
        id: 1,
      };

      const response = await handleMCPRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(1);
      expect(response.result).toHaveProperty('pong', true);
      expect(response.result).toHaveProperty('timestamp');
      expect(response.error).toBeUndefined();
    });

    it('should handle listMethods request', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'listMethods',
        id: 2,
      };

      const response = await handleMCPRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(2);
      expect(response.result).toHaveProperty('methods');
      expect(Array.isArray(response.result.methods)).toBe(true);
      expect(response.result.methods).toContain('ping');
      expect(response.result.methods).toContain('listMethods');
    });

    it('should return error for invalid request format', async () => {
      const request = {
        jsonrpc: '1.0', // Invalid version
        method: 'ping',
        id: 3,
      };

      const response = await handleMCPRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
    });

    it('should return error for method not found', async () => {
      const request = {
        jsonrpc: '2.0' as const,
        method: 'nonExistentMethod',
        id: 4,
      };

      const response = await handleMCPRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(4);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.METHOD_NOT_FOUND);
      expect(response.error?.message).toContain('nonExistentMethod');
    });

    it('should handle request with params', async () => {
      // Register test method
      mcpRouter.register('echo', async (params) => {
        return { echo: params };
      });

      const request = {
        jsonrpc: '2.0' as const,
        method: 'echo',
        params: { message: 'Hello, World!' },
        id: 5,
      };

      const response = await handleMCPRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.id).toBe(5);
      expect(response.result).toEqual({
        echo: { message: 'Hello, World!' },
      });

      // Clean up
      mcpRouter.unregister('echo');
    });

    it('should handle missing id field', async () => {
      const request = {
        jsonrpc: '2.0',
        method: 'ping',
        // Missing id
      };

      const response = await handleMCPRequest(request);

      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe(MCPErrorCode.INVALID_REQUEST);
    });
  });

  describe('MCPRouter', () => {
    it('should register and unregister methods', () => {
      const testHandler = async () => ({ test: true });

      mcpRouter.register('test', testHandler);
      expect(mcpRouter.has('test')).toBe(true);

      mcpRouter.unregister('test');
      expect(mcpRouter.has('test')).toBe(false);
    });

    it('should list all registered methods', () => {
      const methods = mcpRouter.getMethods();
      expect(methods).toContain('ping');
      expect(methods).toContain('listMethods');
    });

    it('should route to correct handler', async () => {
      mcpRouter.register('add', async (params) => {
        return { result: params!.a + params!.b };
      });

      const result = await mcpRouter.route('add', { a: 5, b: 3 });
      expect(result).toEqual({ result: 8 });

      mcpRouter.unregister('add');
    });
  });
});
