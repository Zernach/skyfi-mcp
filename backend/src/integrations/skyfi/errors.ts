/**
 * SkyFi API Error Classes
 */

export class SkyFiError extends Error {
  public statusCode?: number;
  public code?: string;
  public details?: any;

  constructor(message: string, statusCode?: number, code?: string, details?: any) {
    super(message);
    this.name = 'SkyFiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class SkyFiAuthError extends SkyFiError {
  constructor(message = 'Authentication failed', details?: any) {
    super(message, 401, 'AUTH_ERROR', details);
    this.name = 'SkyFiAuthError';
  }
}

export class SkyFiRateLimitError extends SkyFiError {
  public retryAfter?: number;

  constructor(message = 'Rate limit exceeded', retryAfter?: number, details?: any) {
    super(message, 429, 'RATE_LIMIT_ERROR', details);
    this.name = 'SkyFiRateLimitError';
    this.retryAfter = retryAfter;
  }
}

export class SkyFiNotFoundError extends SkyFiError {
  constructor(message = 'Resource not found', details?: any) {
    super(message, 404, 'NOT_FOUND_ERROR', details);
    this.name = 'SkyFiNotFoundError';
  }
}

export class SkyFiValidationError extends SkyFiError {
  constructor(message = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'SkyFiValidationError';
  }
}

export class SkyFiServerError extends SkyFiError {
  constructor(message = 'Server error', statusCode = 500, details?: any) {
    super(message, statusCode, 'SERVER_ERROR', details);
    this.name = 'SkyFiServerError';
  }
}

export class SkyFiTimeoutError extends SkyFiError {
  constructor(message = 'Request timeout', details?: any) {
    super(message, 408, 'TIMEOUT_ERROR', details);
    this.name = 'SkyFiTimeoutError';
  }
}
