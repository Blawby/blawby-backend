import type { Context } from 'hono';
import type { StatusCode, ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result } from '@/shared/types/result';

/**
 * Response utilities for consistent API responses
 *
 * Note: Return types use 'any' intentionally for Hono OpenAPI compatibility.
 * Hono's typed routes require flexible return types that work with its
 * RouteConfigToTypedResponse inference.
 */
export const response = {
  /**
   * Automatically convert a Result<T> to a Hono response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fromResult: <T>(c: Context, result: Result<T>, successCode: StatusCode = 200): any => {
    if (result.success) {
      if ((successCode as number) === 204) {
        return c.body(null, 204);
      }
      return c.json(result.data, successCode as ContentfulStatusCode);
    }

    const { error } = result;
    return c.json({
      error: error.code,
      message: error.message,
      details: error.details,
    }, error.status as ContentfulStatusCode);
  },

  /**
   * 200 OK - Success response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ok: (c: Context, data: unknown): any => c.json(data, 200),

  /**
   * 201 Created - Resource created successfully
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  created: (c: Context, data: unknown): any => c.json(data, 201),

  /**
   * 204 No Content - Success with no response body
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  noContent: (c: Context): any => c.body(null, 204),

  /**
   * 400 Bad Request - Client error
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  badRequest: (c: Context, message: string, details?: unknown): any => c.json({
    error: 'Bad Request',
    message,
    details,
    request_id: c.get('requestId'),
  }, 400),

  /**
   * 401 Unauthorized - Authentication required
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unauthorized: (c: Context, message = 'Authentication required'): any => c.json({
    error: 'Unauthorized',
    message,
    request_id: c.get('requestId'),
  }, 401),

  /**
   * 403 Forbidden - Access denied
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  forbidden: (c: Context, message = 'Access denied'): any => c.json({
    error: 'Forbidden',
    message,
    request_id: c.get('requestId'),
  }, 403),

  /**
   * 404 Not Found - Resource not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notFound: (c: Context, message = 'Resource not found'): any => c.json({
    error: 'Not Found',
    message,
    request_id: c.get('requestId'),
  }, 404),

  /**
   * 409 Conflict - Resource conflict
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conflict: (c: Context, message: string, details?: unknown): any => c.json({
    error: 'Conflict',
    message,
    details,
    request_id: c.get('requestId'),
  }, 409),

  /**
   * 429 Too Many Requests - Rate limit exceeded
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tooManyRequests: (c: Context, message = 'Too many requests', retryAfter?: number): any => {
    if (retryAfter !== undefined) {
      c.res.headers.set('Retry-After', String(retryAfter));
    }
    return c.json({
      error: 'Too Many Requests',
      message,
      ...(retryAfter !== undefined && { retry_after: retryAfter }),
    }, 429);
  },

  /**
   * 422 Unprocessable Entity - Validation error
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unprocessableEntity: (
    c: Context,
    message: string,
    details?: unknown,
  ): any => c.json({
    error: 'Unprocessable Entity',
    message,
    details,
  }, 422),

  /**
   * 500 Internal Server Error - Server error
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  internalServerError: (
    c: Context,
    message = 'Internal server error',
  ): any => c.json({
    error: 'Internal Server Error',
    message,
    request_id: c.get('requestId'),
  }, 500),

  /**
   * Paginated response
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paginated: (
    c: Context,
    data: unknown[],
    total: number, page: number,
    limit: number,
  ): any => c.json({
    data,
    pagination: {
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    },
  }),
};
