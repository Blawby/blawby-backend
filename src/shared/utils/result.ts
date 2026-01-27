import type { Result } from '@/shared/types/result';

/**
 * Success Result helper
 */
export const ok = <T>(data: T): Result<T> => ({
  success: true,
  data,
});

/**
 * Base failure Result helper with satisfies for enforcement
 */
export const fail = (
  message: string,
  status: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR',
  details?: unknown,
): Result<never> => ({
  success: false,
  error: {
    status,
    code,
    message,
    details,
  },
}) satisfies Result<never>;

// --- Common Failure Shortcuts ---

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) => fail(message, 400, code, details);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED') => fail(message, 401, code);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN') => fail(message, 403, code);

export const notFound = (message = 'Not Found', code = 'NOT_FOUND') => fail(message, 404, code);

export const conflict = (message: string, code = 'CONFLICT') => fail(message, 409, code);

export const unprocessable = (message: string, details?: unknown, code = 'VALIDATION_ERROR') => fail(message, 422, code, details);

export const internalError = (message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR'): Result<never> => fail(message, 500, code);

/**
 * Accepted/Pending Result helper - for async operations that are in progress.
 * Uses HTTP 202 Accepted status.
 */
export const accepted = (message: string, code = 'ACCEPTED'): Result<never> => fail(message, 202, code);

export const result = {
  ok,
  fail,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  unprocessable,
  internalError,
  accepted,
};

export default result;
