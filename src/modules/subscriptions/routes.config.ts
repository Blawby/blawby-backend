import type { ModuleConfig } from '@/shared/router/module-router';

/**
 * Subscription Module Route Configuration
 *
 * Configures middleware and routing for subscription endpoints
 * Routes require authentication unless explicitly marked public.
 */
export const config: Partial<ModuleConfig> = {
  middleware: {
    '*': ['requireAuth', 'requireOrgMembership'],
    '/plans': ['requireAuth'],
    '/checkout': ['requireAuth'], // Auth but no org — checkout service handles org resolution
    '/webhook': ['public'], // No auth - Stripe signature verified inside the service
  },
  prefix: undefined, // Mount at /api/subscriptions
};
