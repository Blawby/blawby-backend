import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Public Module Configuration
 *
 * This module handles public endpoints that don't require authentication.
 * Examples: health checks, public info, contact forms.
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': [], // All routes are public
  },
};
