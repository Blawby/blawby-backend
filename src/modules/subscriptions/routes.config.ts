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
    '/plans': ['requireAuth'], // Plans are org-independent; no org context needed
  },
  prefix: undefined, // Mount at /api/subscriptions
};
