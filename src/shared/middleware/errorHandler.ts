import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['app', 'error-handler']);

/**
 * Global Error Handler for Hono Application
 *
 * Handles native Hono exceptions (HTTPException), CASL authorization errors,
 * and unexpected exceptions, formatting them for the client.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  // oxlint-disable-next-line typescript/no-unsafe-assignment
  const startTime = c.get('startTime') ?? Date.now();
  const responseTime = Date.now() - startTime;

  // 1. Hono HTTPException — clean path for middleware/service errors
  if (error instanceof HTTPException) {
    logger.info('HTTP Exception: {status} {message}', {
      status: error.status,
      message: error.message,
      requestId,
      responseTime,
      method: c.req.method,
      url: c.req.url,
    });
    return c.json(
      {
        error: 'HTTP_ERROR',
        message: error.message,
        request_id: requestId,
      },
      error.status
    );
  }

  // 2. CASL authorization errors
  if (error instanceof ForbiddenError) {
    logger.warn('Access forbidden: {message}', {
      message: error.message,
      userId: c.get('userId'),
      organizationId: c.get('activeOrganizationId'),
      requestId,
      responseTime,
    });
    return c.json(
      {
        error: 'FORBIDDEN',
        message: error.message,
        request_id: requestId,
      },
      403
    );
  }

  // 3. Unexpected errors — always 500
  logger.error('Unhandled exception: {message} [{method} {url}]', {
    message: error instanceof Error ? error.message : 'Unknown error',
    cause: error instanceof Error && error.cause instanceof Error ? error.cause.message : undefined,
    method: c.req.method,
    url: c.req.url,
    requestId,
    responseTime,
    error,
    userId: c.get('userId'),
    organizationId: c.get('activeOrganizationId'),
  });

  return c.json(
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      request_id: requestId,
    },
    500
  );
};
