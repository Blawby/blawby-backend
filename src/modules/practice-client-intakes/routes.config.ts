import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    'GET /post-pay/status': ['public'],
    // Staff-only routes require org membership
    'POST /:uuid/invite': ['requireAuth', 'requireOrgMembership'],
    'GET /:practice_id': ['requireAuth', 'requireOrgMembership'],
    'GET /:practice_id/:id': ['requireAuth', 'requireOrgMembership'],
    'PATCH /:uuid/status': ['requireAuth', 'requireOrgMembership'],
    'PATCH /:uuid/convert': ['requireAuth', 'requireOrgMembership'],
  },
};
