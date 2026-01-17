import type { z } from 'zod';
import type { BetterAuthInstance } from '@/shared/auth/better-auth';
import {
  createSubscriptionSchema,
  cancelSubscriptionSchema,
} from '@/modules/subscriptions/validations/subscription.validation';

export type CreateSubscriptionRequest = z.infer<typeof createSubscriptionSchema>;
export type CancelSubscriptionRequest = z.infer<typeof cancelSubscriptionSchema>;

// ============================================================================
// WHY WE CAN'T INFER TYPES (like practice.types.ts does)
// ============================================================================

/**
 * ISSUE: Stripe plugin methods are NOT typed in BetterAuthInstance['api']
 *
 * Unlike organization plugin methods (createOrganization, listOrganizations, etc.),
 * the Stripe plugin methods (upgradeSubscription, cancelSubscription, etc.) are NOT
 * automatically typed in BetterAuthInstance['api'].
 *
 * This means we CANNOT do:
 *   type UpgradeSubscriptionBody = z.infer<
 *     BetterAuthInstance['api']['upgradeSubscription']['options']['body']
 *   >
 *
 * Because TypeScript error: Property 'upgradeSubscription' does not exist on type 'InferAPI<...>'
 *
 * REASON: The Stripe plugin adds methods at runtime but doesn't export proper TypeScript types
 * for Better Auth's type inference system. The methods exist at runtime, but TypeScript
 * doesn't know about them.
 *
 * SOLUTION: We define the types manually based on Better Auth documentation.
 * This is why we need `as unknown as SubscriptionAPI` in the service code.
 */

// ============================================================================
// BETTER AUTH SUBSCRIPTION API TYPES
// ============================================================================

/**
 * Subscription API types for Better Auth Stripe plugin
 * Based on Better Auth documentation: https://better-auth.com/docs/plugins/stripe
 */

// Query parameter types
export type ListSubscriptionsQuery = {
  referenceId?: string;
  customerType?: 'user' | 'organization';
};

// Request body types
export type UpgradeSubscriptionBody = {
  plan: string;
  annual?: boolean;
  referenceId?: string;
  subscriptionId?: string;
  metadata?: Record<string, unknown>;
  customerType?: 'user' | 'organization';
  seats?: number;
  locale?: string;
  successUrl: string;
  cancelUrl: string;
  returnUrl?: string;
  disableRedirect?: boolean;
};

export type CancelSubscriptionBody = {
  subscriptionId?: string;
  referenceId?: string;
  customerType?: 'user' | 'organization';
  returnUrl: string;
};

export type RestoreSubscriptionBody = {
  subscriptionId: string;
  referenceId?: string;
  customerType?: 'user' | 'organization';
};

// Response types based on Better Auth documentation
export type Subscription = {
  id: string;
  status: string;
  planId: string;
  currentPeriodEnd: number;
  cancelAtPeriodEnd: boolean;
  limits?: {
    projects?: number;
    [key: string]: unknown;
  };
  referenceId?: string | null;
};

export type UpgradeSubscriptionResponse = {
  subscriptionId?: string;
  url?: string;
};

// ============================================================================
// API METHOD TYPES
// ============================================================================

/**
 * Subscription API method signatures for Better Auth Stripe plugin
 *
 * These methods exist at runtime (added by the Stripe plugin) but are NOT typed
 * in BetterAuthInstance['api'], which is why we define them manually here.
 *
 * Compare with practice.types.ts which can infer types:
 *   BetterAuthInstance['api']['createOrganization']['options']['body']
 *
 * But we cannot do:
 *   BetterAuthInstance['api']['upgradeSubscription']['options']['body']
 *   ❌ TypeScript error: Property 'upgradeSubscription' does not exist
 */
export type SubscriptionAPI = {
  listActiveSubscriptions: (args: {
    query: ListSubscriptionsQuery;
    headers: Record<string, string>;
  }) => Promise<Subscription[]>;
  upgradeSubscription: (args: {
    body: UpgradeSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<UpgradeSubscriptionResponse>;
  cancelSubscription: (args: {
    body: CancelSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<unknown>;
  restoreSubscription?: (args: {
    body: RestoreSubscriptionBody;
    headers: Record<string, string>;
  }) => Promise<unknown>;
};

