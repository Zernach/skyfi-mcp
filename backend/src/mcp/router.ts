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
  async route(
    method: string,
    params?: Record<string, any>,
    context?: {
      clientId?: string;
      streaming?: boolean;
      onProgress?: (progress: any) => void;
    }
  ): Promise<any> {
    const handler = this.methods[method];

    if (!handler) {
      throw new MethodNotFoundError(method);
    }

    try {
      // Pass context to handler if provided
      if (context) {
        return await handler({ ...params, _context: context });
      }
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
  const { message, conversationId, context, _context } = params || {};

  if (!message || typeof message !== 'string') {
    throw new Error('Message is required and must be a string');
  }

  if (message.trim().length === 0) {
    throw new Error('Message cannot be empty');
  }

  if (message.length > 10000) {
    throw new Error('Message is too long (max 10000 characters)');
  }

  try {
    const response = await chatService.chat(
      {
        message: message.trim(),
        conversationId,
        context,
      },
      _context // Pass streaming context if available
    );

    return response;
  } catch (error) {
    logger.error('Chat router error:', {
      error: error instanceof Error ? error.message : String(error),
      conversationId,
      messageLength: message.length,
    });
    throw error;
  }
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
