import type { Context } from 'hono';
import type { StatusCode, ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result } from '@/shared/types/result';

/**
 * Response utilities for consistent API responses
 * All responses are automatically converted to snake_case
 */
export const response = {
  /**
   * Automatically convert a Result<T> to a Hono response
   */
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
  ok: (c: Context, data: unknown): any => c.json(data, 200),

  /**
   * 201 Created - Resource created successfully
   */
  created: (c: Context, data: unknown): any => c.json(data, 201),

  /**
   * 204 No Content - Success with no response body
   */
  noContent: (c: Context): any => c.body(null, 204),

  /**
   * 400 Bad Request - Client error
   */
  badRequest: (c: Context, message: string, details?: unknown): any => c.json({
    error: 'Bad Request',
    message,
    details,
    request_id: c.get('requestId'),
  }, 400),

  /**
   * 401 Unauthorized - Authentication required
   */
  unauthorized: (c: Context, message = 'Authentication required'): any => c.json({
    error: 'Unauthorized',
    message,
    request_id: c.get('requestId'),
  }, 401),

  /**
   * 403 Forbidden - Access denied
   */
  forbidden: (c: Context, message = 'Access denied'): any => c.json({
    error: 'Forbidden',
    message,
    request_id: c.get('requestId'),
  }, 403),

  /**
   * 404 Not Found - Resource not found
   */
  notFound: (c: Context, message = 'Resource not found'): any => c.json({
    error: 'Not Found',
    message,
    request_id: c.get('requestId'),
  }, 404),

  /**
   * 409 Conflict - Resource conflict
   */
  conflict: (c: Context, message: string, details?: unknown): any => c.json({
    error: 'Conflict',
    message,
    details,
    request_id: c.get('requestId'),
  }, 409),

  /**
   * 429 Too Many Requests - Rate limit exceeded
   */
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
  unprocessableEntity: (
    c: Context,
    message: string,
    details?: unknown,
  ) => c.json({
    error: 'Unprocessable Entity',
    message,
    details,
  }, 422),

  /**
   * 500 Internal Server Error - Server error
   */
  internalServerError: (
    c: Context,
    message = 'Internal server error',
  ) => c.json({
    error: 'Internal Server Error',
    message,
    request_id: c.get('requestId'),
  }, 500),

  /**
   * Paginated response
   */
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
