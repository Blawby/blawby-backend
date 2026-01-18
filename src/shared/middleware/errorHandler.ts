import { getLogger } from '@logtape/logtape';
import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { AppError } from '@/shared/types/result';
import { toSnakeCase } from '@/shared/utils/responseUtils';

const logger = getLogger(['app', 'error-handler']);

/**
 * Global Error Handler for Hono Application
 *
 * Handles unexpected exceptions and formats them for the client.
 * Explicit failures should be handled via the Result pattern in route handlers.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const startTime = c.get('startTime') || Date.now();
  const responseTime = Date.now() - startTime;

  const appError = error as Partial<AppError>;
  const status = appError.status || 500;
  const message = error instanceof Error ? error.message : 'Internal Server Error';
  const code = appError.code || 'INTERNAL_SERVER_ERROR';

  logger.error(
    "Unexpected error occurred: {message} [{code}] ({status}) {method} {url}",
    {
      message,
      code,
      status,
      method: c.req.method,
      url: c.req.url,
      requestId,
      responseTime,
      error,
      userId: c.get('userId'),
      organizationId: c.get('activeOrganizationId'),
    }
  );

  return c.json(toSnakeCase({
    error: code,
    message: status === 500 ? 'An unexpected error occurred' : message,
    details: appError.details,
    request_id: requestId,
  }), status as ContentfulStatusCode);
};
