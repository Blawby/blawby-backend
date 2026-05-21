import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Trust Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
  },
};
