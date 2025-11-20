import { MCPHandler, MCPMethodRegistry } from './types';
import { MethodNotFoundError } from './errors';
import logger from '../utils/logger';
import { chatService } from '../services/chat.service';
import { getToolNames } from '../services/tool-definitions';

/**
 * MCP Method Router
 * Routes MCP method calls to appropriate handlers
 */
export class MCPRouter {
  private methods: MCPMethodRegistry = {};

  /**
   * Register a method handler
   */
  register(method: string, handler: MCPHandler): void {
    if (this.methods[method]) {
      logger.warn(`Method ${method} is being overwritten`);
    }
    this.methods[method] = handler;
    logger.info(`Registered MCP method: ${method}`);
  }

  /**
   * Unregister a method handler
   */
  unregister(method: string): void {
    delete this.methods[method];
    logger.info(`Unregistered MCP method: ${method}`);
  }

  /**
   * Check if method exists
   */
  has(method: string): boolean {
    return method in this.methods;
  }

  /**
   * Get all registered methods
   */
  getMethods(): string[] {
    return Object.keys(this.methods);
  }

  /**
   * Route a method call to its handler
   */
  async route(method: string, params?: Record<string, any>): Promise<any> {
    const handler = this.methods[method];

    if (!handler) {
      throw new MethodNotFoundError(method);
    }

    try {
      return await handler(params);
    } catch (error) {
      logger.error(`Error in method handler ${method}:`, error);
      throw error;
    }
  }
}

// Singleton instance
export const mcpRouter = new MCPRouter();

// Register default methods
mcpRouter.register('ping', async () => {
  return { pong: true, timestamp: new Date().toISOString() };
});

mcpRouter.register('listMethods', async () => {
  return { methods: mcpRouter.getMethods() };
});

// Register chat method with tool-calling
mcpRouter.register('chat', async (params) => {
  const { message, conversationId, context } = params || {};

  if (!message || typeof message !== 'string') {
    throw new Error('Message is required and must be a string');
  }

  const response = await chatService.chat({
    message,
    conversationId,
    context,
  });

  return response;
});

// Register conversation management methods
mcpRouter.register('clearConversation', async (params) => {
  const { conversationId } = params || {};

  if (!conversationId || typeof conversationId !== 'string') {
    throw new Error('Conversation ID is required');
  }

  chatService.clearConversation(conversationId);

  return {
    success: true,
    message: 'Conversation cleared',
    conversationId,
  };
});

// Register tool information method
mcpRouter.register('listTools', async () => {
  const toolNames = getToolNames();
  return {
    tools: toolNames,
    count: toolNames.length,
  };
});
