/**
 * Subscription Events Schema
 *
 * Audit trail for subscription lifecycle events
 */

import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { subscriptionPlans } from '@/modules/subscriptions/database/schema/subscriptionPlans.schema';
import { subscriptions } from '@/schema/better-auth-schema';

// Event type enum
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

export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to Better Auth subscription
    subscription_id: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    // Link to plan (optional, for plan changes)
    plan_id: uuid('plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),

    // Event details
    event_type: text('event_type').$type<SubscriptionEventType>().notNull(),
    from_status: text('from_status'),
    to_status: text('to_status'),
    from_plan_id: uuid('from_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),
    to_plan_id: uuid('to_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),

    // Audit fields
    triggered_by: text('triggered_by'), // User ID
    triggered_by_type: text('triggered_by_type').$type<SubscriptionTriggeredByType>(),

    // Additional context
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    error_message: text('error_message'),

    // Timestamp
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('subscription_events_subscription_idx').on(table.subscription_id),
    index('subscription_events_type_idx').on(table.event_type),
    index('subscription_events_created_at_idx').on(table.created_at),
    index('subscription_events_plan_idx').on(table.plan_id),
  ]
);

export const subscriptionEventsRelations = relations(subscriptionEvents, ({ one }) => ({
  plan: one(subscriptionPlans, {
    fields: [subscriptionEvents.plan_id],
    references: [subscriptionPlans.id],
  }),
  fromPlan: one(subscriptionPlans, {
    fields: [subscriptionEvents.from_plan_id],
    references: [subscriptionPlans.id],
  }),
  toPlan: one(subscriptionPlans, {
    fields: [subscriptionEvents.to_plan_id],
    references: [subscriptionPlans.id],
  }),
}));

// Type exports
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;
