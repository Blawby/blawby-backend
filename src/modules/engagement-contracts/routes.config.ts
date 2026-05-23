import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    // Staff-only routes require org membership
    '*': ['requireAuth', 'requireOrgMembership'],
    // Client-facing routes — client is authenticated but not an org member
    'GET /:practice_id/:id': ['requireAuth'],
    'PATCH /:practice_id/:id/accept': ['requireAuth'],
    'PATCH /:practice_id/:id/decline': ['requireAuth'],
  },
};
