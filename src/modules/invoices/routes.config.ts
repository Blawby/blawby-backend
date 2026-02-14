import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Invoices Module Configuration
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};
