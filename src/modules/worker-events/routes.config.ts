import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Worker Events Module Configuration
 *
 * Routes use custom shared-secret authentication via X-Worker-Secret header,
 * so standard auth middleware is not applied. Rate limiting is applied to
 * protect against abuse.
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['public', 'rateLimit'],
  },
};
