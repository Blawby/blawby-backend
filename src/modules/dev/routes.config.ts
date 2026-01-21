import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Development Module Configuration
 *
 * This module provides utilities for local development, such as email previews.
 * It is only intended for local use.
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['public'], // Ensure routes are accessible without session in dev
  },
};
