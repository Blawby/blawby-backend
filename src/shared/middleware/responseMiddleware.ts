import type { Context, MiddlewareHandler, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { getLogger } from '@logtape/logtape';

import { isProduction } from '@/shared/utils/env';
import { logError } from './logger';

const logger = getLogger(['shared', 'middleware', 'response']);

/**
 * Custom validation error type for structured error handling
 */
type ValidationError = Error & {
  status: number;
  details: {
    error: string;
    message: string;
    details: {
      field: string;
      message: string;
    }[];
  };
};

const VALID_HTTP_STATUSES: ReadonlySet<number> = new Set([200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500]);

const isValidHttpStatus = (code: number): code is ContentfulStatusCode => VALID_HTTP_STATUSES.has(code);

const hasNumericStatus = (error: unknown): error is Error & { status: number } =>
  error instanceof Error && 'status' in error && typeof error.status === 'number';

const isValidationError = (error: unknown): error is ValidationError =>
  hasNumericStatus(error) && 'details' in error && typeof error.details === 'object' && error.details !== null;

/**
 * Global Response Middleware
 *
 * Handles request/response lifecycle, error management, and logging.
 *
 * Features:
 * - Request timing and ID generation
 * - Structured error logging
 * - Validation error handling
 * - Better Auth error handling
 * - Development request logging
 */
export const responseMiddleware = (): MiddlewareHandler => async (c: Context, next: Next) => {
  const startTime = Date.now();
  const requestId = c.get('requestId');

  // Set request context data
  c.set('startTime', startTime);

  try {
    await next();

    // Calculate and log response time
    const responseTime = Date.now() - startTime;
    c.set('responseTime', responseTime);

    // Request logging (disabled in production for performance)
    if (!isProduction()) {
      logger.info('✅ {method} {url} - {responseTime}ms', {
        method: c.req.method,
        url: c.req.url,
        responseTime,
      });
    }

    return;
  } catch (error) {
    const responseTime = Date.now() - startTime;

    // Handle HTTP exceptions (Hono's built-in handling might not return JSON)
    if (error instanceof HTTPException) {
      const status = isValidHttpStatus(error.status) ? error.status : 500;

      logError(error, {
        method: c.req.method,
        url: c.req.url,
        statusCode: status,
        userId: c.get('userId'),
        organizationId: c.get('activeOrganizationId'),
        requestId,
        responseTime,
        errorType: 'HTTPException',
        errorMessage: error.message,
      });

      return c.json(
        {
          error: error.message,
          message: error.message,
          request_id: requestId,
        },
        status
      );
    }

    // Handle custom validation errors
    if (isValidationError(error)) {
      const validationError = error;
      const { status, details } = validationError;
      const safeStatus = isValidHttpStatus(status) ? status : 500;

      logError(error, {
        method: c.req.method,
        url: c.req.url,
        statusCode: safeStatus,
        userId: c.get('userId'),
        organizationId: c.get('activeOrganizationId'),
        requestId,
        responseTime,
        errorType: 'ValidationError',
        errorMessage: error.message,
      });

      return c.json(details, safeStatus);
    }

    // Handle custom errors with status codes
    if (hasNumericStatus(error) && !(error instanceof HTTPException)) {
      const status = Number(error.status);
      const safeStatus = isValidHttpStatus(status) ? status : 500;

      logError(error, {
        method: c.req.method,
        url: c.req.url,
        statusCode: safeStatus,
        userId: c.get('userId'),
        organizationId: c.get('activeOrganizationId'),
        requestId,
        responseTime,
        errorType: 'CustomError',
        errorMessage: error.message,
      });

      return c.json(
        {
          error: error.message,
          message: error.message,
          request_id: requestId,
        },
        safeStatus
      );
    }

    // Handle Better Auth unauthorized errors
    if (error && typeof error === 'object' && 'status' in error && error.status === 'UNAUTHORIZED') {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Authentication required',
          request_id: requestId,
        },
        401
      );
    }

    // Handle unexpected errors
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

    return c.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        request_id: requestId,
      },
      500
    );
  }
};
