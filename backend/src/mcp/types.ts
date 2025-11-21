/**
 * MCP (Model Context Protocol) Type Definitions
 * Following JSON-RPC 2.0 specification
 */

export interface MCPRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
  id: string | number;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  result?: any;
  error?: MCPError;
  id: string | number;
}

export interface MCPError {
  code: number;
  message: string;
  data?: any;
}

export interface MCPEvent {
  event: string;
  data: any;
  id?: string;
}

export enum MCPErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
}

export type MCPHandler = (params?: Record<string, any>) => Promise<any>;

export interface MCPMethodRegistry {
  [method: string]: MCPHandler;
}
