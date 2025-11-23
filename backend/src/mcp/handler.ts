import { MCPRequest, MCPResponse } from './types';
import { validateRequest, createResponse } from './validator';
import { mcpRouter } from './router';
import { MCPProtocolError, InternalError } from './errors';
import { sseManager } from './sse';
import logger from '../utils/logger';

/**
 * Handle MCP request and return response (synchronous)
 */
export async function handleMCPRequest(rawRequest: unknown): Promise<MCPResponse> {
  let request: MCPRequest;
  let requestId: string | number = 0;

  try {
    // Validate request
    request = validateRequest(rawRequest);
    requestId = request.id;

    logger.info(`MCP Request: ${request.method}`, {
      id: request.id,
      method: request.method,
      params: request.params,
    });

    // Route to handler
    const result = await mcpRouter.route(request.method, request.params);

    // Create success response
    const response = createResponse(requestId, result);

    logger.info(`MCP Response: ${request.method}`, {
      id: request.id,
      success: true,
    });

    return response;
  } catch (error) {
    // Handle errors
    logger.error('MCP Error:', error);

    if (error instanceof MCPProtocolError) {
      return createResponse(requestId, undefined, error.toJSON());
    }

    // Unexpected error
    const internalError = new InternalError(
      error instanceof Error ? error.message : 'Unknown error'
    );
    return createResponse(requestId, undefined, internalError.toJSON());
  }
}

/**
 * Handle MCP request with SSE streaming updates
 */
export async function handleMCPRequestWithStreaming(
  rawRequest: unknown,
  clientId: string
): Promise<void> {
  let requestId: string | number = 0;
  let request: MCPRequest | undefined;

  try {
    // Validate request
    request = validateRequest(rawRequest);
    requestId = request.id;

    logger.info(`MCP Streaming Request: ${request.method}`, {
      id: request.id,
      method: request.method,
      clientId,
      requestId,
      params: request.params,
    });

    // Check if client is still connected before sending events
    logger.info(`Sending processing_started event`, {
      clientId,
      requestId,
      method: request.method,
    });
    if (!sseManager.sendToClient(clientId, {
      event: 'processing_started',
      data: {
        requestId,
        method: request.method,
        timestamp: new Date().toISOString(),
      },
      id: `${requestId}-start`,
    })) {
      logger.warn(`Client ${clientId} not connected, aborting streaming request`, {
        requestId,
        clientId,
      });
      return;
    }
    logger.info(`processing_started event sent successfully`, { clientId, requestId });

    // Route to handler with timeout protection
    const REQUEST_TIMEOUT = 120000; // 2 minutes
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, REQUEST_TIMEOUT);
    });

    let result;
    try {
      result = await Promise.race([
        mcpRouter.route(request.method, request.params, {
          clientId,
          streaming: true,
          onProgress: (progress: any) => {
            // Send progress updates via SSE (check connection first)
            logger.info(`Sending progress update`, {
              clientId,
              requestId,
              progress,
            });
            if (!sseManager.sendToClient(clientId, {
              event: 'progress',
              data: {
                requestId,
                ...progress,
                timestamp: new Date().toISOString(),
              },
            })) {
              logger.warn(`Client ${clientId} disconnected during progress update`, {
                requestId,
                clientId,
              });
              // Don't throw - just log, let the request continue
            }
          },
        }),
        timeoutPromise,
      ]);
      
      // Cleanup timeout if request completed successfully
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    } catch (error) {
      // Cleanup timeout on error
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
      throw error;
    }

    // Send completion event with result
    logger.info(`Sending processing_complete event`, {
      clientId,
      requestId,
      method: request.method,
      hasResult: !!result,
    });
    if (!sseManager.sendToClient(clientId, {
      event: 'processing_complete',
      data: {
        requestId,
        method: request.method,
        result,
        timestamp: new Date().toISOString(),
      },
      id: `${requestId}-complete`,
    })) {
      logger.warn(`Client ${clientId} disconnected before completion`, {
        requestId,
        clientId,
      });
    } else {
      logger.info(`processing_complete event sent successfully`, { clientId, requestId });
    }

    logger.info(`MCP Streaming Response: ${request.method}`, {
      id: request.id,
      clientId,
      success: true,
    });
  } catch (error) {
    // Handle errors
    logger.error('MCP Streaming Error:', {
      error: error instanceof Error ? error.message : String(error),
      requestId,
      clientId,
      method: request?.method,
    });

    const errorData = error instanceof MCPProtocolError
      ? error.toJSON()
      : new InternalError(
          error instanceof Error ? error.message : 'Unknown error'
        ).toJSON();

    // Try to send error event (may fail if client disconnected)
    sseManager.sendToClient(clientId, {
      event: 'processing_error',
      data: {
        requestId,
        error: errorData,
        timestamp: new Date().toISOString(),
      },
      id: `${requestId}-error`,
    });
  }
}
