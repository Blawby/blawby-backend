import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Matters Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};
