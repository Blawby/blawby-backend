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

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown): Result<never> => fail(message, 400, code, details);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED'): Result<never> => fail(message, 401, code);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN'): Result<never> => fail(message, 403, code);

export const notFound = (message = 'Not Found', code = 'NOT_FOUND'): Result<never> => fail(message, 404, code);

export const conflict = (message: string, code = 'CONFLICT'): Result<never> => fail(message, 409, code);

export const unprocessable = (message: string, details?: unknown, code = 'VALIDATION_ERROR'): Result<never> => fail(message, 422, code, details);

export const internalError = (message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR'): Result<never> => fail(message, 500, code);

/**
 * Response type for accepted/pending operations.
 * HTTP 202 Accepted indicates the request has been accepted for processing,
 * but the processing has not been completed.
 */
export type AcceptedResponse = {
  pending: true;
  status: 202;
  message: string;
  code: string;
};

/**
 * Accepted/Pending Result helper - for async operations that are in progress.
 * Returns a success result since HTTP 202 is a success status code.
 */
export const accepted = (message: string, code = 'ACCEPTED'): Result<AcceptedResponse> => ok({
  pending: true, status: 202, message, code,
});

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
