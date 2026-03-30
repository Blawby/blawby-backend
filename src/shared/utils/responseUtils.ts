import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError, Result } from '@/shared/types/result';

const CONTENTFUL_STATUSES: ReadonlySet<number> = new Set([200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500]);

const isValidContentfulStatus = (status: number): status is ContentfulStatusCode => CONTENTFUL_STATUSES.has(status);

export const sendError = (c: Context, error: AppError) =>
  c.json(
    {
      error: error.code,
      message: error.message,
      details: error.details,
    },
    isValidContentfulStatus(error.status) ? error.status : 500
  );

export const sendResult = <T, M = undefined>(c: Context, result: Result<T, M>, successCode: 200 | 201 | 204 = 200) => {
  if (!result.success) {
    return sendError(c, result.error);
  }

  if (successCode === 204) {
    return c.body(null, 204);
  }

  return c.json(result.data, successCode);
};

/**
 * Unified response helper for standardizing API responses
 */
export const response = {
  fromResult: <T, M = undefined>(c: Context, result: Result<T, M>, successCode: 200 | 201 | 204 = 200) =>
    sendResult(c, result, successCode),

  ok: <T>(c: Context, data: T, successCode: 200 | 201 = 200) => c.json(data, successCode),

  badRequest: (c: Context, message: string, code = 'BAD_REQUEST', details?: unknown) =>
    sendError(c, { status: 400, code, message, details }),

  unauthorized: (c: Context, message = 'Unauthorized', code = 'UNAUTHORIZED') =>
    sendError(c, { status: 401, code, message }),

  forbidden: (c: Context, message = 'Forbidden', code = 'FORBIDDEN') => sendError(c, { status: 403, code, message }),

  notFound: (c: Context, message = 'Not Found', code = 'NOT_FOUND') => sendError(c, { status: 404, code, message }),

  internalError: (c: Context, message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR') =>
    sendError(c, { status: 500, code, message }),

  internalServerError: (c: Context, message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR') =>
    sendError(c, { status: 500, code, message }),

  noContent: (c: Context) => c.body(null, 204),

  created: <T>(c: Context, data: T) => c.json(data, 201),
};
