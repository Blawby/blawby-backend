import type { Context, MiddlewareHandler, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import { logError } from './logger';

/**
 * Custom validation error type for structured error handling
 */
type ValidationError = Error & {
  status: number;
  details: {
    error: string;
    message: string;
    details: Array<{
      field: string;
      message: string;
    }>;
  };
};


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
export const responseMiddleware = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // Set request context data
    c.set('requestId', requestId);
    c.set('startTime', startTime);

    try {
      await next();

      // Calculate and log response time
      const responseTime = Date.now() - startTime;
      c.set('responseTime', responseTime);

      // Development-only request logging
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ ${c.req.method} ${c.req.url} - ${responseTime}ms`);
      }

      return;
    } catch (error) {
      const responseTime = Date.now() - startTime;

      // Handle custom validation errors
      if (error instanceof Error && 'status' in error && 'details' in error) {
        const validationError = error as ValidationError;
        const { status, details } = validationError;

        logError(error, {
          method: c.req.method,
          url: c.req.url,
          statusCode: status,
          userId: c.get('userId'),
          organizationId: c.get('activeOrganizationId'),
          requestId,
          responseTime,
          errorType: 'ValidationError',
          errorMessage: error.message,
        });

        return c.json(details, status as ContentfulStatusCode);
      }

      // Handle custom errors with status codes
      if (error instanceof Error && 'status' in error && typeof (error as unknown as { status: unknown }).status === 'number') {
        const status = Number(error.status);

        logError(error, {
          method: c.req.method,
          url: c.req.url,
          statusCode: status,
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
            requestId,
          },
          status as ContentfulStatusCode,
        );
      }

      // Handle HTTP exceptions (Hono's built-in handling might not return JSON)
      if (error instanceof HTTPException) {
        logError(error, {
          method: c.req.method,
          url: c.req.url,
          statusCode: error.status,
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
            requestId,
          },
          error.status as ContentfulStatusCode,
        );
      }

      // Handle Better Auth unauthorized errors
      if (error && typeof error === 'object' && 'status' in error && error.status === 'UNAUTHORIZED') {
        return c.json(
          {
            error: 'Unauthorized',
            message: 'Authentication required',
            requestId,
          },
          401,
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
          requestId,
        },
        500,
      );
    }
  };
};
