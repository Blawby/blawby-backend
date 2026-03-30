import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Subscription Module Route Configuration
 *
 * Configures middleware and routing for subscription endpoints
 * All routes require authentication
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'], // RateLimit added automatically by default
  },
  prefix: undefined, // Mount at /api/subscriptions
};
