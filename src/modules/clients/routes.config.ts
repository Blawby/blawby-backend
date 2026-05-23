import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
  },
};
