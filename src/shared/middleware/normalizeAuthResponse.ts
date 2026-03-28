/**
 * Normalize Auth Response Middleware
 *
 * Normalizes Better Auth API responses to match project's standard format:
 * - Converts camelCase to snake_case
 * - Normalizes error responses to { error: string, message: string } format
 * - Preserves Better Auth functionality (set-auth-token header, etc.)
 */

import { getLogger } from '@logtape/logtape';
import { snakeCase } from 'es-toolkit/compat';
import type { MiddlewareHandler } from 'hono';

const logger = getLogger(['shared', 'middleware', 'normalize-auth-response']);

const isRecord = (val: unknown): val is Record<string, unknown> => typeof val === 'object' && val !== null;

const getString = (val: unknown): string | undefined => (typeof val === 'string' ? val : undefined);

const copySetCookieHeaders = (sourceHeaders: Headers, targetHeaders: Headers): void => {
  // oxlint-disable-next-line typescript/unbound-method
  const { getSetCookie } = sourceHeaders;

  if (typeof getSetCookie === 'function') {
    const setCookies = getSetCookie.call(sourceHeaders);
    if (setCookies.length > 0) {
      targetHeaders.delete('Set-Cookie');
      setCookies.forEach((cookie) => {
        targetHeaders.append('Set-Cookie', cookie);
      });
    }
  }
};

/**
 * Recursively converts object keys from camelCase to snake_case
 * Local implementation to avoid global overhead in other parts of the app
 */
const toSnakeCase = (obj: unknown): unknown => {
  if (obj === null || obj === undefined) {
    return obj;
  }

  // Handle Date objects - return as-is (will be serialized to ISO string by JSON.stringify)
  if (obj instanceof Date) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = snakeCase(key);
      result[snakeKey] = toSnakeCase(value);
    }
    return result;
  }

  return obj;
};

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

  if (isRecord(error)) {
    const errorObj = error;

    // Handle Better Auth error format: { error: { message: string, code: string } }
    if (isRecord(errorObj.error)) {
      const innerError = errorObj.error;
      return {
        error: getString(innerError.code) ?? getString(innerError.name) ?? 'Error',
        message: getString(innerError.message) ?? 'An error occurred',
      };
    }

    // Handle error with message property
    if (errorObj.message) {
      return {
        error: getString(errorObj.code) ?? getString(errorObj.name) ?? 'Error',
        message: String(errorObj.message),
      };
    }

    // Handle error with code property
    if (errorObj.code) {
      return {
        error: String(errorObj.code),
        message: getString(errorObj.message) ?? 'An error occurred',
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
export const normalizeAuthResponse = (): MiddlewareHandler => async (c, next) => {
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
    const trimmedBody = body.trim();

    if (!trimmedBody) {
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(trimmedBody);
    } catch (error) {
      // If parsing fails despite content-type, it's likely an empty-ish or invalid response
      logger.debug('Failed to parse response body for normalization: {error}', { error });
      return;
    }
    const { status } = response;

    // Normalize error responses (4xx, 5xx)
    if (status >= 400) {
      const normalizedError = normalizeErrorResponse(data);
      const normalizedData = toSnakeCase(normalizedError);

      // Create new response with normalized error
      const normalizedBody = JSON.stringify(normalizedData);
      const newResponse = new Response(normalizedBody, {
        status,
        statusText: response.statusText,
        headers: response.headers,
      });

      copySetCookieHeaders(response.headers, newResponse.headers);

      c.res = newResponse;
      return;
    }

    // Normalize success responses (convert to snake_case)
    const normalizedData = toSnakeCase(data);
    const normalizedBody = JSON.stringify(normalizedData);

    // Create new response with normalized data
    const newResponse = new Response(normalizedBody, {
      status,
      statusText: response.statusText,
      headers: response.headers,
    });

    copySetCookieHeaders(response.headers, newResponse.headers);

    c.res = newResponse;
  } catch (error) {
    // If parsing fails, leave response unchanged
    logger.warn('Failed to normalize response: {error}', { error });
  }
};
