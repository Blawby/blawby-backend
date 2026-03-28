// oxlint-disable import/group-exports
// oxlint-disable import/no-named-export
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Result } from '@/shared/types/result';

/**
 * HTTP Status codes enum
 */
export enum HttpStatus {
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  CONFLICT = 409,
  FORBIDDEN = 403,
  INTERNAL_SERVER_ERROR = 500,
  NOT_FOUND = 404,
  UNAUTHORIZED = 401,
  UNPROCESSABLE_ENTITY = 422,
}

/**
 * Success Result helper
 */
export function ok(): Result<void>;

export function ok<T>(data: T): Result<T>;

export function ok<T>(data?: T): Result<T> {
  return {
    data: data as T,
    success: true,
  };
}

/**
 * Base failure Result helper
 */
export const fail = <T = never>(
  message: string,
  status: ContentfulStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  code = 'INTERNAL_SERVER_ERROR',
  details?: unknown
): Result<T> => ({
  error: {
    code,
    details,
    message,
    status,
  },
  success: false,
});

// --- Common Failure Shortcuts ---

export const badRequest = <T = never>(message: string, code = 'BAD_REQUEST', details?: unknown): Result<T> =>
  fail<T>(message, HttpStatus.BAD_REQUEST, code, details);

export const unauthorized = <T = never>(message = 'Unauthorized', code = 'UNAUTHORIZED'): Result<T> =>
  fail<T>(message, HttpStatus.UNAUTHORIZED, code);

export const forbidden = <T = never>(message = 'Forbidden', code = 'FORBIDDEN'): Result<T> =>
  fail<T>(message, HttpStatus.FORBIDDEN, code);

export const notFound = <T = never>(message = 'Not Found', code = 'NOT_FOUND'): Result<T> =>
  fail<T>(message, HttpStatus.NOT_FOUND, code);

export const conflict = <T = never>(message: string, code = 'CONFLICT'): Result<T> =>
  fail<T>(message, HttpStatus.CONFLICT, code);

export const unprocessable = <T = never>(message: string, details?: unknown, code = 'VALIDATION_ERROR'): Result<T> =>
  fail<T>(message, HttpStatus.UNPROCESSABLE_ENTITY, code, details);

export const internalError = <T = never>(
  message = 'Internal Server Error',
  code = 'INTERNAL_SERVER_ERROR'
): Result<T> => fail<T>(message, HttpStatus.INTERNAL_SERVER_ERROR, code);

/**
 * Response type for accepted/pending operations.
 */
export interface AcceptedResponse {
  pending: true;
  status: HttpStatus.ACCEPTED;
  message: string;
  code: string;
}

/**
 * Accepted/Pending Result helper
 */
export const accepted = (message: string, code = 'ACCEPTED'): Result<AcceptedResponse> =>
  ok({
    code,
    message,
    pending: true,
    status: HttpStatus.ACCEPTED,
  });

export interface ResultUtils {
  ok: {
    (): Result<void>;
    <T>(data: T): Result<T>;
  };
  fail: <T = never>(message: string, status?: ContentfulStatusCode, code?: string, details?: unknown) => Result<T>;
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
  accepted,
  badRequest,
  conflict,
  fail,
  forbidden,
  internalError,
  notFound,
  ok,
  unauthorized,
  unprocessable,
};

export default result;
