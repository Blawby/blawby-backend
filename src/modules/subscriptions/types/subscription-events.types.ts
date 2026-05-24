import type { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscription-events.schema';
export const SUBSCRIPTION_EVENT_TYPES = [
  'created',
  'plan_changed',
  'status_changed',
  'canceled',
  'resumed',
  'payment_succeeded',
  'payment_failed',
  'trial_ending',
  'trial_ended',
] as const;

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

// Triggered by type enum
export const SUBSCRIPTION_TRIGGERED_BY_TYPES = ['user', 'system', 'webhook'] as const;

export type SubscriptionTriggeredByType = (typeof SUBSCRIPTION_TRIGGERED_BY_TYPES)[number];

export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;
