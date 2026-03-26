import { OpenAPIHono } from '@hono/zod-openapi';
import { hasValidationErrors } from '@/shared/router/openapi-hook';
import type { AppContext } from '@/shared/types/hono';

/**
 * Factory to create a pre-configured OpenAPIHono instance.
 *
 * Automatically registers the global validation error hook to ensure
 * readable JSON error responses across all modules.
 */
export const createHonoApp = () => {
  return new OpenAPIHono<AppContext>({
    defaultHook: hasValidationErrors,
  });
};
