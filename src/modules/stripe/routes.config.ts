import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Stripe Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
  },
};
