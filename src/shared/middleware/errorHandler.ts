import type { ErrorHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { logError } from './logger';

/**
 * Simple Error Handler for Hono Applications
 *
 * Handles errors directly and returns JSON responses.
 */
export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = c.get('requestId') || crypto.randomUUID();
  const startTime = c.get('startTime') || Date.now();
  const responseTime = Date.now() - startTime;

  // Handle custom errors with status property
  if (error instanceof Error && 'status' in error) {
    const status = error.status;

    logError(error, {
      method: c.req.method,
      url: c.req.url,
      statusCode: Number(status),
      userId: c.get('userId'),
      organizationId: c.get('activeOrganizationId'),
      requestId,
      responseTime,
      errorType: 'CustomError',
      errorMessage: error.message,
    });

    return c.json({
      error: error.message,
      message: error.message,
    }, status as ContentfulStatusCode);
  }

  // Default error handling
  logError(error, {
    method: c.req.method,
    url: c.req.url,
    statusCode: 500,
    userId: c.get('userId'),
    organizationId: c.get('activeOrganizationId'),
    requestId,
    responseTime,
    errorType: error?.constructor?.name,
    errorMessage: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  });

  return c.json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred',
  }, 500);
};
