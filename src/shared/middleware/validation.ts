import { getLogger } from '@logtape/logtape';
import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { logError } from '@/shared/middleware/logger';
import type { Variables } from '@/shared/types/hono';

/**
 * Generic parameter validation middleware
 * Validates route parameters against a Zod schema
 */
export const validateParams =
  <T extends z.ZodType>(
    schema: T,
    errorMessage = 'Invalid parameters'
  ): MiddlewareHandler<{ Variables: Variables & { validatedParams: z.infer<T> } }> =>
  async (c, next) => {
    const params = c.req.param();
    const validationResult = schema.safeParse(params);

    if (!validationResult.success) {
      logError(new Error(`Validation failed: ${errorMessage}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'ValidationError',
        errorMessage: errorMessage,
        stack: JSON.stringify(validationResult.error.issues),
      });

      return c.json(
        {
          error: 'Bad Request',
          message: errorMessage,
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
        400
      );
    }

    c.set('validatedParams', validationResult.data);
    return next();
  };

/**
 * Generic JSON body validation middleware
 * Validates request body against a Zod schema
 */
export const validateJson =
  <T extends z.ZodType>(
    schema: T,
    errorMessage = 'Invalid request data'
  ): MiddlewareHandler<{ Variables: Variables & { validatedBody: z.infer<T> } }> =>
  async (c, next) => {
    try {
      const body = await c.req.json();
      const validationResult = schema.safeParse(body);

      if (!validationResult.success) {
        logError(new Error(`Validation failed: ${errorMessage}`), {
          method: c.req.method,
          url: c.req.url,
          statusCode: 400,
          errorType: 'ValidationError',
          errorMessage: errorMessage,
          stack: JSON.stringify(validationResult.error.issues),
        });

        const logger = getLogger(['app', 'validation']);
        logger.warn('Validation errors: {errors}', {
          errors: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });

        return c.json(
          {
            error: 'Bad Request',
            message: errorMessage,
            details: validationResult.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          },
          400
        );
      }

      c.set('validatedBody', validationResult.data);
      return next();
    } catch (error) {
      if (error instanceof Error && 'status' in error && 'details' in error) {
        throw error;
      }

      const logger = getLogger(['app', 'validation']);
      logger.error('JSON parsing failed: {error}', { error });
      logError(new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'JSONParseError',
        errorMessage: 'Invalid JSON',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return c.json(
        {
          error: 'Bad Request',
          message: 'Invalid JSON',
          details: error instanceof Error ? error.message : 'Unknown parsing error',
        },
        400
      );
    }
  };

/**
 * Combined parameter and JSON validation middleware
 * Validates both route parameters and request body
 */
export const validateParamsAndJson =
  <TParams extends z.ZodType, TBody extends z.ZodType>(
    paramSchema: TParams,
    bodySchema: TBody,
    paramErrorMessage = 'Invalid parameters',
    bodyErrorMessage = 'Invalid request data'
  ): MiddlewareHandler<{
    Variables: Variables & { validatedParams: z.infer<TParams>; validatedBody: z.infer<TBody> };
  }> =>
  async (c, next) => {
    const params = c.req.param();
    const paramValidation = paramSchema.safeParse(params);

    if (!paramValidation.success) {
      logError(new Error(`Validation failed: ${paramErrorMessage}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'ValidationError',
        errorMessage: paramErrorMessage,
        stack: JSON.stringify(paramValidation.error.issues),
      });

      const logger = getLogger(['app', 'validation']);
      logger.warn('Param validation errors: {errors}', {
        errors: paramValidation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });

      return c.json(
        {
          error: 'Bad Request',
          message: paramErrorMessage,
          details: paramValidation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
        400
      );
    }

    try {
      const body = await c.req.json();
      const bodyValidation = bodySchema.safeParse(body);

      if (!bodyValidation.success) {
        logError(new Error(`Validation failed: ${bodyErrorMessage}`), {
          method: c.req.method,
          url: c.req.url,
          statusCode: 400,
          errorType: 'ValidationError',
          errorMessage: bodyErrorMessage,
          stack: JSON.stringify(bodyValidation.error.issues),
        });

        const logger = getLogger(['app', 'validation']);
        logger.warn('Body validation errors: {errors}', {
          errors: bodyValidation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });

        return c.json(
          {
            error: 'Bad Request',
            message: bodyErrorMessage,
            details: bodyValidation.error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
              code: issue.code,
            })),
          },
          400
        );
      }

      c.set('validatedParams', paramValidation.data);
      c.set('validatedBody', bodyValidation.data);
      return next();
    } catch (error) {
      const logger = getLogger(['app', 'validation']);
      logger.error('Validation failed: JSON parse error: {error}', { error });
      return c.json({ error: 'Bad Request', message: 'Invalid JSON' }, 400);
    }
  };
