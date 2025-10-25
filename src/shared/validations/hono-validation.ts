import type { Context } from 'hono';
import { z } from 'zod';

/**
 * Validates route parameters using Zod schema with @hono/zod-validator
 * @param context - Hono context
 * @param schema - Zod schema for parameter validation
 * @returns Validated parameters
 * @throws HTTPException if validation fails
 */
const validateParams = <T extends z.ZodSchema>(
  context: Context,
  schema: T,
): z.infer<T> => {
  try {
    const params = context.req.param();
    const validatedParams = schema.parse(params);
    return validatedParams;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid parameters');
    }
    throw new Error('Invalid parameters');
  }
};

/**
 * Validates query parameters using Zod schema with @hono/zod-validator
 * @param context - Hono context
 * @param schema - Zod schema for query validation
 * @returns Validated query parameters
 * @throws HTTPException if validation fails
 */
const validateQuery = <T extends z.ZodSchema>(
  context: Context,
  schema: T,
): z.infer<T> => {
  try {
    const query = context.req.query();
    const validatedQuery = schema.parse(query);
    return validatedQuery;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid query parameters');
    }
    throw new Error('Invalid query parameters');
  }
};

/**
 * Validates request body using Zod schema with @hono/zod-validator
 * @param context - Hono context
 * @param schema - Zod schema for body validation
 * @returns Validated body data
 * @throws HTTPException if validation fails
 */
const validateBody = async <T extends z.ZodSchema>(
  context: Context,
  schema: T,
): Promise<z.infer<T>> => {
  try {
    const body = await context.req.json();
    const validatedBody = schema.parse(body);
    return validatedBody;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid request body');
    }
    throw new Error('Invalid request body');
  }
};

/**
 * Validates headers using Zod schema with @hono/zod-validator
 * @param context - Hono context
 * @param schema - Zod schema for header validation
 * @returns Validated headers
 * @throws HTTPException if validation fails
 */
const validateHeaders = <T extends z.ZodSchema>(
  context: Context,
  schema: T,
): z.infer<T> => {
  try {
    const headers = context.req.header();
    const validatedHeaders = schema.parse(headers);
    return validatedHeaders;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error('Invalid headers');
    }
    throw new Error('Invalid headers');
  }
};

/**
 * Combined validation for multiple request parts using @hono/zod-validator
 * @param context - Hono context
 * @param schemas - Object containing schemas for different parts
 * @returns Object with validated data for each part
 * @throws HTTPException if any validation fails
 */
const validateRequest = async <T extends {
  params?: z.ZodSchema;
  query?: z.ZodSchema;
  body?: z.ZodSchema;
  headers?: z.ZodSchema;
}>(
  context: Context,
  schemas: T,
): Promise<{
  params?: T['params'] extends z.ZodSchema ? z.infer<T['params']> : never;
  query?: T['query'] extends z.ZodSchema ? z.infer<T['query']> : never;
  body?: T['body'] extends z.ZodSchema ? z.infer<T['body']> : never;
  headers?: T['headers'] extends z.ZodSchema ? z.infer<T['headers']> : never;
}> => {
  const result: Record<string, unknown> = {};

  if (schemas.params) {
    result.params = validateParams(context, schemas.params);
  }

  if (schemas.query) {
    result.query = validateQuery(context, schemas.query);
  }

  if (schemas.body) {
    result.body = await validateBody(context, schemas.body);
  }

  if (schemas.headers) {
    result.headers = validateHeaders(context, schemas.headers);
  }

  return result;
};

/**
 * Clean validator API with explicit method names
 */
export const validator = {
  validateParams,
  validateQuery,
  validateBody,
  validateHeaders,
  validateRequest,
} as const;

