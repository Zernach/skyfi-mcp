import { MCPRequest, MCPResponse } from './types';
import { validateRequest, createResponse } from './validator';
import { mcpRouter } from './router';
import { MCPProtocolError, InternalError } from './errors';
import logger from '../utils/logger';

/**
 * Handle MCP request and return response
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
