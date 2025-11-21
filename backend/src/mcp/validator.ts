import { z } from 'zod';
import { MCPRequest, MCPResponse } from './types';
import { InvalidRequestError, ParseError } from './errors';

/**
 * Zod schema for MCP Request
 */
const mcpRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  method: z.string().min(1),
  params: z.record(z.any()).optional(),
  id: z.union([z.string(), z.number()]),
});

/**
 * Zod schema for MCP Response
 */
const mcpResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.any().optional(),
  error: z
    .object({
      code: z.number(),
      message: z.string(),
      data: z.any().optional(),
    })
    .optional(),
  id: z.union([z.string(), z.number()]),
});

/**
 * Validate MCP request
 */
export function validateRequest(data: unknown): MCPRequest {
  try {
    return mcpRequestSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRequestError('Invalid request format', error.errors);
    }
    throw new ParseError('Failed to parse request');
  }
}

/**
 * Validate MCP response
 */
export function validateResponse(data: unknown): MCPResponse {
  try {
    return mcpResponseSchema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new InvalidRequestError('Invalid response format', error.errors);
    }
    throw new ParseError('Failed to parse response');
  }
}

/**
 * Create MCP response object
 */
export function createResponse(id: string | number, result?: any, error?: any): MCPResponse {
  return {
    jsonrpc: '2.0',
    result,
    error,
    id,
  };
}
