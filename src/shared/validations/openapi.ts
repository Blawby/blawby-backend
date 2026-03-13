import { z } from '@hono/zod-openapi';

/**
 * Common response schemas for OpenAPI documentation
 */

export const errorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Bad Request' }),
    message: z.string().openapi({ example: 'Invalid request data' }),
    details: z.any().optional(),
  })
  .openapi('ErrorResponse');

export const unauthorizedResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Unauthorized' }),
    message: z.string().openapi({ example: 'Authentication required' }),
    details: z.any().optional(),
  })
  .openapi('UnauthorizedResponse');

export const forbiddenResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Forbidden' }),
    message: z.string().openapi({ example: 'Access denied' }),
    details: z.any().optional(),
  })
  .openapi('ForbiddenResponse');

export const notFoundResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Not Found' }),
    message: z.string().openapi({ example: 'Resource not found' }),
  })
  .openapi('NotFoundResponse');

export const internalServerErrorResponseSchema = z
  .object({
    error: z.string().openapi({ example: 'Internal Server Error' }),
    message: z.string().openapi({ example: 'An unexpected error occurred' }),
  })
  .openapi('InternalServerErrorResponse');

/**
 * Common parameter schemas
 */

export const practiceIdParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: { name: 'practice_id', in: 'path' },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
});

export const matterUuidParamSchema = z.object({
  practice_id: z.uuid().openapi({
    param: { name: 'practice_id', in: 'path' },
    description: 'Practice ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  uuid: z.uuid().openapi({
    param: { name: 'uuid', in: 'path' },
    description: 'Matter ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

/**
 * Standard Resource ID Param (uses 'id')
 */
export const resourceIdParamSchema = practiceIdParamSchema.extend({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Resource ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

export const matterIdParamSchema = practiceIdParamSchema.extend({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Matter ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});
