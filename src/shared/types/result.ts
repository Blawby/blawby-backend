export type AppError = {
  status: number;
  code: string;
  message: string;
  details?: unknown;
};

export type Result<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };

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
  details?: unknown
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

export const badRequest = (message: string, code = 'BAD_REQUEST', details?: unknown) =>
  fail(message, 400, code, details);

export const unauthorized = (message = 'Unauthorized', code = 'UNAUTHORIZED') =>
  fail(message, 401, code);

export const forbidden = (message = 'Forbidden', code = 'FORBIDDEN') =>
  fail(message, 403, code);

export const notFound = (message = 'Not Found', code = 'NOT_FOUND') =>
  fail(message, 404, code);

export const conflict = (message: string, code = 'CONFLICT') =>
  fail(message, 409, code);

export const unprocessable = (message: string, details?: unknown, code = 'VALIDATION_ERROR') =>
  fail(message, 422, code, details);

export const internalError = (message = 'Internal Server Error', code = 'INTERNAL_SERVER_ERROR') =>
  fail(message, 500, code);
