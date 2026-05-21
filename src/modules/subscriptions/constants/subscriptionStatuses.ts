/**
 * Subscription Status Constants
 *
 * Single source of truth for subscription status values used across the codebase.
 *
 * NOTE: These statuses are based on current Better Auth Stripe plugin usage.
 * If the plugin adds more statuses that grant access, update PRACTICE_ENTITLED_STATUSES accordingly.
 */

// Stripe subscription statuses that grant practice access
export const PRACTICE_ENTITLED_STATUSES = ['active', 'trialing', 'past_due'] as const;

// All possible Stripe subscription statuses for reference
export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
} as const;

// Status types for better type safety
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];
export type PracticeEntitledStatus = (typeof PRACTICE_ENTITLED_STATUSES)[number];
