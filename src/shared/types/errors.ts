import type { ContentfulStatusCode } from 'hono/utils/http-status';

/**
 * Discriminated union for application errors
 * Used by errorHandler middleware to map to HTTP responses
 */
export interface AppError {
  kind: 'validation_error' | 'authorization_error' | 'transaction_error' | 'not_found_error' | 'app_error';
  code: string;
  message: string;
  status: ContentfulStatusCode;
  context?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Create a validation error (400 Bad Request)
 */
export const createValidationError = (code: string, message: string, context?: Record<string, unknown>): AppError => ({
  kind: 'validation_error',
  code,
  message,
  status: 400,
  context,
});

/**
 * Create a not found error (404 Not Found)
 */
export const createNotFoundError = (code: string, message: string, context?: Record<string, unknown>): AppError => ({
  kind: 'not_found_error',
  code,
  message,
  status: 404,
  context,
});

/**
 * Create an authorization error (403 Forbidden)
 */
export const createAuthorizationError = (
  code: string,
  message: string,
  context?: Record<string, unknown>
): AppError => ({
  kind: 'authorization_error',
  code,
  message,
  status: 403,
  context,
});

/**
 * Create a transaction error (500 Internal Server Error)
 */
export const createTransactionError = (code: string, message: string, context?: Record<string, unknown>): AppError => ({
  kind: 'transaction_error',
  code,
  message,
  status: 500,
  context,
});

/**
 * Create a generic app error
 */
export const createAppError = (
  code: string,
  message: string,
  status: ContentfulStatusCode = 500,
  context?: Record<string, unknown>
): AppError => ({
  kind: 'app_error',
  code,
  message,
  status,
  context,
});
