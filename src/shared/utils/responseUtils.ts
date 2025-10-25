import { snakeCase } from 'es-toolkit/compat';
import type { Context } from 'hono';

/**
 * Recursively converts object keys from camelCase to snake_case
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
 * Response utilities for consistent API responses
 * All responses are automatically converted to snake_case
 */
export const response = {
  /**
   * 200 OK - Success response
   */
  ok: (c: Context, data: unknown): Response => c.json(toSnakeCase(data), 200),

  /**
   * 201 Created - Resource created successfully
   */
  created: (c: Context, data: unknown): Response => c.json(toSnakeCase(data), 201),

  /**
   * 204 No Content - Success with no response body
   */
  noContent: (c: Context): Response => c.body(null, 204),

  /**
   * 400 Bad Request - Client error
   */
  badRequest: (c: Context, message: string, details?: unknown): Response => c.json(toSnakeCase({
    error: 'Bad Request',
    message,
    details: details ? toSnakeCase(details) : undefined,
  }), 400),

  /**
   * 401 Unauthorized - Authentication required
   */
  unauthorized: (c: Context, message = 'Authentication required'): Response => c.json(toSnakeCase({
    error: 'Unauthorized',
    message,
  }), 401),

  /**
   * 403 Forbidden - Access denied
   */
  forbidden: (c: Context, message = 'Access denied'): Response => c.json(toSnakeCase({
    error: 'Forbidden',
    message,
  }), 403),

  /**
   * 404 Not Found - Resource not found
   */
  notFound: (c: Context, message = 'Resource not found'): Response => c.json(toSnakeCase({
    error: 'Not Found',
    message,
  }), 404),

  /**
   * 409 Conflict - Resource conflict
   */
  conflict: (c: Context, message: string, details?: unknown): Response => c.json(toSnakeCase({
    error: 'Conflict',
    message,
    details: details ? toSnakeCase(details) : undefined,
  }), 409),

  /**
   * 422 Unprocessable Entity - Validation error
   */
  unprocessableEntity: (
    c: Context,
    message: string,
    details?: unknown,
  ): Response => c.json({
    error: 'Unprocessable Entity',
    message,
    details: details ? toSnakeCase(details) : undefined,
  }, 422),

  /**
   * 500 Internal Server Error - Server error
   */
  internalServerError: (
    c: Context,
    message = 'Internal server error',
  ): Response => c.json({
    error: 'Internal Server Error',
    message,
  }, 500),

  /**
   * Paginated response
   */
  paginated: (
    c: Context,
    data: unknown[],
    total: number, page: number,
    limit: number,
  ): Response => c.json({
    data: toSnakeCase(data),
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  }),
};
