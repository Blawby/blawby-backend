import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Worker Events Module Configuration
 *
 * All routes use custom shared-secret authentication via X-Worker-Secret header,
 * so standard auth middleware is not applied.
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['public'],
  },
};
