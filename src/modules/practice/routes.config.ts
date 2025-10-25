import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Practice Module Configuration
 *
 * Route-level middleware using Hono patterns:
 * - '*' - All routes
 * - '/path' - Specific path (all methods)
 * - 'GET /path' - Method + path
 * - '/path/*' - Path with wildcard
 * - '/path/:id' - Path with parameter
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};
