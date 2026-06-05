import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
    '/:slug/intake': ['public'],
    '/create': ['public'],
    'GET /post-pay/status': ['public'],
    '/staff/*': ['requireAuth', 'requireOrgMembership'],
  },
};
