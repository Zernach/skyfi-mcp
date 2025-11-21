import { MCPError, MCPErrorCode } from './types';

/**
 * Base MCP Error class
 */
export class MCPProtocolError extends Error {
  public code: number;
  public data?: any;

  constructor(code: number, message: string, data?: any) {
    super(message);
    this.name = 'MCPProtocolError';
    this.code = code;
    this.data = data;
  }

  toJSON(): MCPError {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

export class ParseError extends MCPProtocolError {
  constructor(message = 'Parse error', data?: any) {
    super(MCPErrorCode.PARSE_ERROR, message, data);
    this.name = 'ParseError';
  }
}

export class InvalidRequestError extends MCPProtocolError {
  constructor(message = 'Invalid Request', data?: any) {
    super(MCPErrorCode.INVALID_REQUEST, message, data);
    this.name = 'InvalidRequestError';
  }
}

export class MethodNotFoundError extends MCPProtocolError {
  constructor(method: string) {
    super(MCPErrorCode.METHOD_NOT_FOUND, `Method not found: ${method}`);
    this.name = 'MethodNotFoundError';
  }
}

export class InvalidParamsError extends MCPProtocolError {
  constructor(message = 'Invalid params', data?: any) {
    super(MCPErrorCode.INVALID_PARAMS, message, data);
    this.name = 'InvalidParamsError';
  }
}

export class InternalError extends MCPProtocolError {
  constructor(message = 'Internal error', data?: any) {
    super(MCPErrorCode.INTERNAL_ERROR, message, data);
    this.name = 'InternalError';
  }
}
