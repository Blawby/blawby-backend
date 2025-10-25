import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Onboarding Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'throttle'],
  },
};
