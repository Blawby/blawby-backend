import type { MiddlewareHandler } from 'hono';
import type { z } from 'zod';
import { logError } from '@/shared/middleware/logger';
import type { Variables } from '@/shared/types/hono';
import { response } from '@/shared/utils/responseUtils';

/**
 * Custom validation error type
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
 * Generic parameter validation middleware
 * Validates route parameters against a Zod schema
 */
export const validateParams = <T extends z.ZodType>(
  schema: T,
  errorMessage = 'Invalid parameters',
): MiddlewareHandler<{ Variables: Variables & { validatedParams: z.infer<T> } }> => {
  return async (c, next) => {
    const params = c.req.param();
    const validationResult = schema.safeParse(params);

    if (!validationResult.success) {
      // Log validation error using proper logger
      logError(new Error(`Validation failed: ${errorMessage}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'ValidationError',
        errorMessage: errorMessage,
        stack: JSON.stringify(validationResult.error.issues),
      });


      // Return the proper response directly instead of throwing
      return response.badRequest(c, errorMessage, {
        details: validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      });
    }

    // Store validated params in context for use in route handler
    c.set('validatedParams', validationResult.data);
    return next();
  };
};

/**
 * Generic JSON body validation middleware
 * Validates request body against a Zod schema
 */
export const validateJson = <T extends z.ZodTypeAny>(
  schema: T,
  errorMessage = 'Invalid request data',
): MiddlewareHandler<{ Variables: Variables & { validatedBody: z.infer<T> } }> => {
  return async (c, next) => {
    try {
      const body = await c.req.json();
      const validationResult = schema.safeParse(body);

      if (!validationResult.success) {
        // Log validation error using proper logger
        logError(new Error(`Validation failed: ${errorMessage}`), {
          method: c.req.method,
          url: c.req.url,
          statusCode: 400,
          errorType: 'ValidationError',
          errorMessage: errorMessage,
          stack: JSON.stringify(validationResult.error.issues),
        });

        // Log detailed validation errors for debugging
        console.log('🔍 VALIDATION ERRORS:', validationResult.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })));

        // Return the proper response directly instead of throwing
        return c.json({
          error: errorMessage,
          message: 'Please check your input data',
          details: validationResult.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        }, 400);
      }

      // Store validated body in context for use in route handler
      c.set('validatedBody', validationResult.data);
      return next();
    } catch (error) {
      // If it's our custom validation error, re-throw it
      if (error instanceof Error && 'status' in error && 'details' in error) {
        throw error;
      }

      console.log('🔍 JSON parsing failed:', error);
      logError(new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'JSONParseError',
        errorMessage: 'Invalid JSON',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return c.json({
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON',
        details: error instanceof Error ? error.message : 'Unknown parsing error',
      }, 400);
    }
  };
};

/**
 * Combined parameter and JSON validation middleware
 * Validates both route parameters and request body
 */
export const validateParamsAndJson = <
  TParams extends z.ZodTypeAny,
  TBody extends z.ZodTypeAny
>(
  paramSchema: TParams,
  bodySchema: TBody,
  paramErrorMessage = 'Invalid parameters',
  bodyErrorMessage = 'Invalid request data',
): MiddlewareHandler<{
  Variables: Variables
  & { validatedParams: z.infer<TParams>; validatedBody: z.infer<TBody> };
}> => {
  return async (c, next) => {
    // Validate parameters
    const params = c.req.param();
    const paramValidation = paramSchema.safeParse(params);

    if (!paramValidation.success) {
      // Log validation error using proper logger
      logError(new Error(`Validation failed: ${paramErrorMessage}`), {
        method: c.req.method,
        url: c.req.url,
        statusCode: 400,
        errorType: 'ValidationError',
        errorMessage: paramErrorMessage,
        stack: JSON.stringify(paramValidation.error.issues),
      });

      // Log detailed validation errors for debugging
      console.log('🔍 PARAM VALIDATION ERRORS (validateParamsAndJson):', paramValidation.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })));

      // Return the proper response directly instead of throwing
      return c.json({
        error: paramErrorMessage,
        message: 'Please check your route parameters',
        details: paramValidation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })),
      }, 400);
    }

    // Validate JSON body
    try {
      const body = await c.req.json();
      const bodyValidation = bodySchema.safeParse(body);

      if (!bodyValidation.success) {
        // Log validation error using proper logger
        logError(new Error(`Validation failed: ${bodyErrorMessage}`), {
          method: c.req.method,
          url: c.req.url,
          statusCode: 400,
          errorType: 'ValidationError',
          errorMessage: bodyErrorMessage,
          stack: JSON.stringify(bodyValidation.error.issues),
        });

        // Throw custom error to be caught by global handler
        const validationError = new Error(bodyErrorMessage) as ValidationError;
        validationError.status = 400;
        validationError.details = {
          error: bodyErrorMessage,
          message: 'Please check your input data',
          details: bodyValidation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        };
        // Log detailed validation errors for debugging
        console.log('🔍 BODY VALIDATION ERRORS (validateParamsAndJson):', bodyValidation.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        })));

        // Return the proper response directly instead of throwing
        return c.json({
          error: bodyErrorMessage,
          message: 'Please check your input data',
          details: bodyValidation.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        }, 400);
      }

      // Store validated data in context
      c.set('validatedParams', paramValidation.data);
      c.set('validatedBody', bodyValidation.data);
      return next();
    } catch (error) {
      console.error(error);
      return c.json({
        error: 'Invalid JSON',
        message: 'Request body must be valid JSON',
      }, 400);
    }
  };
};
