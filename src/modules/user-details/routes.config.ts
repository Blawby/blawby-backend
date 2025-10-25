/**
 * User Details Routes Configuration
 *
 * Route definitions for user details API endpoints
 */

import type { ModuleConfig } from '@/shared/router/module-router';

export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth'],
  },
};
