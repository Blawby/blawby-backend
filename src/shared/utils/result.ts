import type { Result } from '@/shared/types/result';

/**
 * Success Result helper
 */
export function ok(): Result<void>;
export function ok<T>(data: T): Result<T>;
export function ok<T>(data?: T): Result<T> {
  return {
    success: true,
    data: data as T,
  };
}

/**
 * Base failure Result helper
 */
export const fail = <T = never>(
  message: string,
  status: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR',
  details?: unknown,
): Result<T> => ({
  success: false,
  error: {
    status,
    code,
    message,
    details,
  },
});

// --- Common Failure Shortcuts ---

export const badRequest = <T = never>(message: string, code = 'BAD_REQUEST', details?: unknown): Result<T> => fail<T>(message, 400, code, details);

export const unauthorized = <T = never>(message = 'Unauthorized', code = 'UNAUTHORIZED'): Result<T> => fail<T>(message, 401, code);

export const forbidden = <T = never>(message = 'Forbidden', code = 'FORBIDDEN'): Result<T> => fail<T>(message, 403, code);

export const notFound = <T = never>(message = 'Not Found', code = 'NOT_FOUND'): Result<T> => fail<T>(message, 404, code);

export const conflict = <T = never>(message: string, code = 'CONFLICT'): Result<T> => fail<T>(message, 409, code);

export const unprocessable = <T = never>(message: string, details?: unknown, code = 'VALIDATION_ERROR'): Result<T> => fail<T>(message, 422, code, details);

export const internalError = <T = never>(message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR'): Result<T> => fail<T>(message, 500, code);

/**
 * Response type for accepted/pending operations.
 */
export type AcceptedResponse = {
  pending: true;
  status: 202;
  message: string;
  code: string;
};

/**
 * Accepted/Pending Result helper
 */
export const accepted = (message: string, code = 'ACCEPTED'): Result<AcceptedResponse> => ok({
  pending: true, status: 202, message, code,
});

export interface ResultUtils {
  ok: {
    (): Result<void>;
    <T>(data: T): Result<T>;
  };
  fail: <T = never>(message: string, status?: number, code?: string, details?: unknown) => Result<T>;
  badRequest: <T = never>(message: string, code?: string, details?: unknown) => Result<T>;
  unauthorized: <T = never>(message?: string, code?: string) => Result<T>;
  forbidden: <T = never>(message?: string, code?: string) => Result<T>;
  notFound: <T = never>(message?: string, code?: string) => Result<T>;
  conflict: <T = never>(message: string, code?: string) => Result<T>;
  unprocessable: <T = never>(message: string, details?: unknown, code?: string) => Result<T>;
  internalError: <T = never>(message?: string, code?: string) => Result<T>;
  accepted: (message: string, code?: string) => Result<AcceptedResponse>;
}

export const result: ResultUtils = {
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
