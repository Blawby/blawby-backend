import { z } from '@hono/zod-openapi';

/**
 * Common response schemas for OpenAPI documentation
 */

export const errorResponseSchema = z.object({
  error: z.string().openapi({ example: 'Bad Request' }),
  message: z.string().openapi({ example: 'Invalid request data' }),
  details: z.any().optional(),
}).openapi('ErrorResponse');

export const notFoundResponseSchema = z.object({
  error: z.string().openapi({ example: 'Not Found' }),
  message: z.string().openapi({ example: 'Resource not found' }),
}).openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z.object({
  error: z.string().openapi({ example: 'Internal Server Error' }),
  message: z.string().openapi({ example: 'An unexpected error occurred' }),
}).openapi('InternalServerErrorResponse');

/**
 * Common parameter schemas
 */

export const practiceIdParamSchema = z.object({
  practiceId: z.uuid().openapi({
    param: { name: 'practiceId', in: 'path' },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const matterUuidParamSchema = z.object({
  practiceId: z.uuid().openapi({
    description: 'Practice ID (UUID)',
  }),
  uuid: z.uuid().openapi({
    description: 'Matter ID (UUID)',
  }),
});
