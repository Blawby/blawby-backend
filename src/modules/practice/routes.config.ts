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
    '*': ['requireAuth', 'requireOrgMembership'], // RateLimit added automatically by default
    'POST /': ['requireAuth'],
    'GET /list': ['requireAuth'],
    // Specific route middleware
    '/details/:slug': ['public'],
    'GET /:practice_id/intake-templates': ['requireAuth', 'requireOrgMembership'],
    'POST /:practice_id/intake-templates': ['requireAuth', 'requireOrgMembership'],
    'GET /:practice_id/intake-templates/:id': ['requireAuth', 'requireOrgMembership'],
    'PUT /:practice_id/intake-templates/:id': ['requireAuth', 'requireOrgMembership'],
    'DELETE /:practice_id/intake-templates/:id': ['requireAuth', 'requireOrgMembership'],
  },
};
