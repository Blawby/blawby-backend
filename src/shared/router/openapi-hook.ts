import type { Hook } from '@hono/zod-openapi';
import type { AppContext } from '@/shared/types/hono';

/**
 * Default hook for OpenAPIHono to format validation errors.
 *
 * Instead of returning a raw Zod error, this formats it into a clean
 * JSON response with a specific structure.
 */
export const hasValidationErrors: Hook<any, AppContext, any, any> = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        success: false,
        error: {
          name: 'ValidationError',
          message: 'Validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        },
      },
      400
    );
  }
  return;
};
