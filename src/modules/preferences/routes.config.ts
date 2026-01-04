/**
 * Preferences Routes Configuration
 *
 * Route definitions for preferences API endpoints
 */

import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};

