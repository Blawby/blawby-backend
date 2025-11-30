/**
 * Normalize Auth Response Middleware
 *
 * Normalizes Better Auth API responses to match project's standard format:
 * - Converts camelCase to snake_case
 * - Normalizes error responses to { error: string, message: string } format
 * - Preserves Better Auth functionality (set-auth-token header, etc.)
 */

import type { MiddlewareHandler } from 'hono';

import { toSnakeCase } from '@/shared/utils/responseUtils';

/**
 * Normalizes Better Auth error response to standard format
 */
const normalizeErrorResponse = (error: unknown): { error: string; message: string } => {
  if (typeof error === 'string') {
    return {
      error: 'Error',
      message: error,
    };
  }

  if (error && typeof error === 'object') {
    const errorObj = error as Record<string, unknown>;

    // Handle Better Auth error format: { error: { message: string, code: string } }
    if (errorObj.error && typeof errorObj.error === 'object') {
      const innerError = errorObj.error as Record<string, unknown>;
      return {
        error: (innerError.code as string) || (innerError.name as string) || 'Error',
        message: (innerError.message as string) || 'An error occurred',
      };
    }

    // Handle error with message property
    if (errorObj.message) {
      return {
        error: (errorObj.code as string) || (errorObj.name as string) || 'Error',
        message: String(errorObj.message),
      };
    }

    // Handle error with code property
    if (errorObj.code) {
      return {
        error: String(errorObj.code),
        message: (errorObj.message as string) || 'An error occurred',
      };
    }
  }

  return {
    error: 'Error',
    message: 'An error occurred',
  };
};

/**
 * Normalize Better Auth responses to project standard format
 *
 * This middleware:
 * 1. Intercepts Better Auth responses
 * 2. Converts camelCase to snake_case
 * 3. Normalizes error responses to { error: string, message: string } format
 * 4. Preserves Better Auth functionality (set-auth-token header, etc.)
 */
export const normalizeAuthResponse = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();

    // Only process JSON responses
    const contentType = c.res.headers.get('content-type');

    if (!contentType?.includes('application/json')) {
      return;
    }

    try {
      // Clone the response to avoid modifying the original
      const response = c.res.clone();
      const body = await response.text();

      if (!body) {
        return;
      }

      const data = JSON.parse(body);
      const status = response.status;

      // Normalize error responses (4xx, 5xx)
      if (status >= 400) {
        const normalizedError = normalizeErrorResponse(data);
        const normalizedData = toSnakeCase(normalizedError);

        // Create new response with normalized error
        const normalizedBody = JSON.stringify(normalizedData);
        c.res = new Response(normalizedBody, {
          status,
          statusText: response.statusText,
          headers: response.headers,
        });
        return;
      }

      // Normalize success responses (convert to snake_case)
      const normalizedData = toSnakeCase(data);
      const normalizedBody = JSON.stringify(normalizedData);

      // Create new response with normalized data
      c.res = new Response(normalizedBody, {
        status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      // If parsing fails, leave response unchanged
      console.warn('[Auth] Failed to normalize response:', error);
    }
  };
};

