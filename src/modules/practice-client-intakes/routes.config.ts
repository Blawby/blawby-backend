import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    'GET /post-pay/status': ['public'],
    'POST /:uuid/checkout-session': ['requireAuth'],
    'PUT /:uuid': ['requireAuth'],
  },
};
