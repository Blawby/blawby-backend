/**
 * Functional Error Handling with Discriminated Unions
 * No classes - pure TypeScript types + factory functions
 */

/**
 * Application Error Type - discriminated union for type-safe error handling
 */
export type AppError =
  | {
      kind: 'app_error';
      code: string; // 'INVOICE_NOT_FOUND', 'DB_TRANSACTION_FAILED'
      status: number; // HTTP status
      message: string; // User-safe message
      context: Record<string, unknown>; // Debug context
      cause?: Error; // Original error chain
    }
  | {
      kind: 'validation_error';
      code: string;
      message: string;
      context: Record<string, unknown>;
    }
  | {
      kind: 'transaction_error';
      code: string;
      message: string;
      context: Record<string, unknown>;
      cause?: Error;
    }
  | {
      kind: 'authorization_error';
      code: string;
      message: string;
      context: Record<string, unknown>;
    };

/**
 * Factory function: Create an app error with code, status, message, context, and cause
 *
 * @param code - Error code (e.g., 'INVOICE_NOT_FOUND')
 * @param status - HTTP status code
 * @param message - User-safe error message
 * @param context - Debug context (invoiceId, organizationId, etc.)
 * @param cause - Original error (thrown exception)
 */
export const createAppError = (
  code: string,
  status: number,
  message: string,
  context: Record<string, unknown> = {},
  cause?: Error
): AppError => ({
  kind: 'app_error',
  code,
  status,
  message,
  context,
  cause,
});

/**
 * Factory function: Create a validation error
 *
 * @param code - Error code (e.g., 'INVALID_INVOICE_DATA')
 * @param message - Validation error message (safe to expose)
 * @param context - Debug context
 */
export const createValidationError = (
  code: string,
  message: string,
  context: Record<string, unknown> = {}
): AppError => ({
  kind: 'validation_error',
  code,
  message,
  context,
});

/**
 * Factory function: Create a transaction error
 * Used for database transaction failures, atomicity violations
 *
 * @param code - Error code (e.g., 'TRANSACTION_FAILED')
 * @param message - Error message
 * @param context - Debug context
 * @param cause - Original error
 */
export const createTransactionError = (
  code: string,
  message: string,
  context: Record<string, unknown> = {},
  cause?: Error
): AppError => ({
  kind: 'transaction_error',
  code,
  message,
  context,
  cause,
});

/**
 * Factory function: Create an authorization error
 *
 * @param code - Error code (e.g., 'FORBIDDEN')
 * @param message - Authorization error message
 * @param context - Debug context
 */
export const createAuthorizationError = (
  code: string,
  message: string,
  context: Record<string, unknown> = {}
): AppError => ({
  kind: 'authorization_error',
  code,
  message,
  context,
});

/**
 * Type guard: Check if error is an AppError
 */
export const isAppError = (error: AppError): error is AppError =>
  typeof error === 'object' &&
  error !== null &&
  'kind' in error &&
  (error.kind === 'app_error' ||
    error.kind === 'validation_error' ||
    error.kind === 'transaction_error' ||
    error.kind === 'authorization_error');
