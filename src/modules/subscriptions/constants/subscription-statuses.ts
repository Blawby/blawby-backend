/**
 * Subscription Status Constants
 *
 * Single source of truth for subscription status values used across the codebase.
 *
 * NOTE: These statuses determine which Stripe subscription states grant practice access.
 * If Stripe adds more statuses that should grant access, update PRACTICE_ENTITLED_STATUSES accordingly.
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
  PAUSED: 'paused',
} as const;

// Status types for better type safety
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];
export type PracticeEntitledStatus = (typeof PRACTICE_ENTITLED_STATUSES)[number];
