import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Payouts Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
  },
};
