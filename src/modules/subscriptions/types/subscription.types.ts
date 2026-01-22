import { z } from 'zod';
import { subscriptionValidations } from '@/modules/subscriptions/validations/subscription.validation';

// Inferred from Zod schemas
export type CreateSubscriptionRequest = z.infer<typeof subscriptionValidations.createSubscriptionSchema>;
export type CancelSubscriptionRequest = z.infer<typeof subscriptionValidations.cancelSubscriptionSchema>;

// ============================================================================
// WHY WE CAN'T INFER TYPES (like practice.types.ts does)
// ============================================================================

/**
 * ISSUE: Stripe plugin methods are NOT typed in BetterAuthInstance['api']
 *
 * Unlike organization plugin methods (createOrganization, listOrganizations, etc.),
 * the Stripe plugin methods (upgradeSubscription, cancelSubscription, etc.) are NOT
 * automatically typed in BetterAuthInstance['api'].
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

// Response schemas inferred types
export type SubscriptionPlanResponse = z.infer<typeof subscriptionValidations.subscriptionPlanResponseSchema>;
export type SubscriptionResponse = z.infer<typeof subscriptionValidations.subscriptionResponseSchema>;
export type SubscriptionWithDetailsResponse = z.infer<typeof subscriptionValidations.subscriptionWithDetailsResponseSchema>;
export type ListPlansResponse = z.infer<typeof subscriptionValidations.listPlansResponseSchema>;
export type CreateSubscriptionResponse = z.infer<typeof subscriptionValidations.createSubscriptionResponseSchema>;
export type CancelSubscriptionResponse = z.infer<typeof subscriptionValidations.cancelSubscriptionResponseSchema>;
export type GetCurrentSubscriptionResponse = z.infer<typeof subscriptionValidations.getCurrentSubscriptionResponseSchema>;
