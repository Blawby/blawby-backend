import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppError, Result } from '@/shared/types/result';

export const sendError = (c: Context, error: AppError) =>
  c.json(
    {
      error: error.code,
      message: error.message,
      details: error.details,
    },
    error.status as unknown as ContentfulStatusCode
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
  fromResult: <T, M = undefined>(c: Context<any, any, any>, result: Result<T, M>, successCode: 200 | 201 | 204 = 200) =>
    sendResult(c, result, successCode) as any,

  ok: <T>(c: Context<any, any, any>, data: T, successCode: 200 | 201 = 200) =>
    c.json(data, successCode as ContentfulStatusCode) as any,

  badRequest: (c: Context<any, any, any>, message: string, code = 'BAD_REQUEST', details?: unknown) =>
    sendError(c, { status: 400, code, message, details }) as any,

  unauthorized: (c: Context<any, any, any>, message = 'Unauthorized', code = 'UNAUTHORIZED') =>
    sendError(c, { status: 401, code, message }) as any,

  forbidden: (c: Context<any, any, any>, message = 'Forbidden', code = 'FORBIDDEN') =>
    sendError(c, { status: 403, code, message }) as any,

  notFound: (c: Context<any, any, any>, message = 'Not Found', code = 'NOT_FOUND') =>
    sendError(c, { status: 404, code, message }) as any,

  internalError: (c: Context<any, any, any>, message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR') =>
    sendError(c, { status: 500, code, message }) as any,

  internalServerError: (c: Context<any, any, any>, message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR') =>
    sendError(c, { status: 500, code, message }) as any,

  noContent: (c: Context<any, any, any>) => c.body(null, 204) as any,

  created: <T>(c: Context<any, any, any>, data: T) => c.json(data, 201) as any,
};
