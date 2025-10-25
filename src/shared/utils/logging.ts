/**
 * Logging utilities for sanitization and helper functions
 * Ensures sensitive data is not logged in production
 */

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-auth-token',
];

const SENSITIVE_BODY_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'accessToken',
  'refreshToken',
  'creditCard',
  'ssn',
];

/**
 * Sanitize request headers to hide sensitive data
 * Shows only first 20 characters of sensitive headers
 */
export const sanitizeHeaders = <T extends Record<string, unknown>>(
  headers: T,
): T => {
  const sanitized = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      // Show only first 20 characters for sensitive headers
      if (typeof value === 'string' && value.length > 20) {
        sanitized[key] = `${value.substring(0, 20)}...`;
      } else {
        sanitized[key] = value;
      }
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
};

/**
 * Sanitize request/response body to hide sensitive fields
 */
export const sanitizeBody = <T>(body: T): T => {
  if (!body || typeof body !== 'object') {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item)) as T;
  }

  const sanitized = {} as Record<string, unknown>;

  for (const [key, value] of Object.entries(body)) {
    const lowerKey = key.toLowerCase();

    if (SENSITIVE_BODY_FIELDS.some((field) => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
};

/**
 * Extract useful error information safely
 * Handles Error objects, plain objects, and strings
 */
export const sanitizeError = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause,
      // Include any custom properties
      ...(error as unknown as Record<string, unknown>),
    };
  }

  if (typeof error === 'object' && error !== null) {
    return error as Record<string, unknown>;
  }

  return {
    message: String(error),
  };
};

/**
 * Determine if a request should skip logging
 * Reduces noise from health checks, static assets, etc.
 */
export const shouldSkipLogging = (url: string, method: string): boolean => {
  // Skip health check endpoints
  if (url === '/api/health' || url === '/health') {
    return true;
  }

  // Skip OPTIONS requests (CORS preflight)
  if (method === 'OPTIONS') {
    return true;
  }

  // Skip static assets
  if (url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i)) {
    return true;
  }

  return false;
};

/**
 * Determine error type for categorization
 */
export const categorizeError = (error: unknown): string => {
  if (!error) {
    return 'unknown';
  }

  const errorObj = error as Record<string, unknown>;
  const errorName = (errorObj.name as string)?.toLowerCase() || '';
  const errorMessage = (errorObj.message as string)?.toLowerCase() || '';

  // Authentication errors
  if (
    errorName.includes('auth')
    || errorName.includes('unauthorized')
    || errorMessage.includes('authentication')
    || errorMessage.includes('unauthorized')
  ) {
    return 'authentication';
  }

  // Validation errors
  if (
    errorName.includes('validation')
    || errorName.includes('zod')
    || errorMessage.includes('validation')
  ) {
    return 'validation';
  }

  // Database errors
  if (
    errorName.includes('database')
    || errorName.includes('postgres')
    || errorName.includes('drizzle')
    || errorMessage.includes('relation')
    || errorMessage.includes('table')
    || errorMessage.includes('column')
  ) {
    return 'database';
  }

  // HTTP errors
  if (errorName.includes('http') || errorObj.statusCode) {
    return 'http';
  }

  // Not found errors
  if (errorName.includes('notfound') || errorObj.statusCode === 404) {
    return 'notfound';
  }

  return 'unknown';
};

/**
 * Format response time in human-readable format
 */
export const formatResponseTime = (milliseconds: number): string => {
  if (milliseconds < 1) {
    return `${(milliseconds * 1000).toFixed(2)}μs`;
  }
  if (milliseconds < 1000) {
    return `${milliseconds.toFixed(2)}ms`;
  }
  return `${(milliseconds / 1000).toFixed(2)}s`;
};
