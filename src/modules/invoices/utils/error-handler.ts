import type { Logger } from '@logtape/logtape';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

/**
 * Standardized error handler for invoice service operations
 * Extracts error details, logs them, and returns a consistent error result
 */
export const handleServiceError = (
  error: unknown,
  logger: Logger,
  logContext: Record<string, unknown>,
  userMessage: string
): Result<never> => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  let detail = '';

  if (error && typeof error === 'object' && 'detail' in error && typeof error.detail === 'string') {
    detail = error.detail;
  }

  logger.error(`${userMessage}: {error} {detail}`, {
    ...logContext,
    error: message,
    detail,
  });

  return result.internalError(userMessage);
};
