/**
 * Subscription Events Schema
 *
 * Audit trail for subscription lifecycle events
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { subscriptionPlans } from './subscriptionPlans.schema';

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

export type SubscriptionEventType = typeof SUBSCRIPTION_EVENT_TYPES[number];

// Triggered by type enum
export const SUBSCRIPTION_TRIGGERED_BY_TYPES = ['user', 'system', 'webhook'] as const;

export type SubscriptionTriggeredByType = typeof SUBSCRIPTION_TRIGGERED_BY_TYPES[number];

export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to Better Auth subscription
    subscriptionId: text('subscription_id').notNull(),

    // Link to plan (optional, for plan changes)
    planId: uuid('plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),

    // Event details
    eventType: text('event_type').$type<SubscriptionEventType>().notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    fromPlanId: uuid('from_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),
    toPlanId: uuid('to_plan_id').references(() => subscriptionPlans.id, { onDelete: 'set null' }),

    // Audit fields
    triggeredBy: text('triggered_by'), // User ID
    triggeredByType: text('triggered_by_type').$type<SubscriptionTriggeredByType>(),

    // Additional context
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    errorMessage: text('error_message'),

    // Timestamp
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('subscription_events_subscription_idx').on(table.subscriptionId),
    index('subscription_events_type_idx').on(table.eventType),
    index('subscription_events_created_at_idx').on(table.createdAt),
    index('subscription_events_plan_idx').on(table.planId),
  ],
);

export const subscriptionEventsRelations = relations(subscriptionEvents, ({ one }) => ({
  plan: one(subscriptionPlans, {
    fields: [subscriptionEvents.planId],
    references: [subscriptionPlans.id],
  }),
  fromPlan: one(subscriptionPlans, {
    fields: [subscriptionEvents.fromPlanId],
    references: [subscriptionPlans.id],
  }),
  toPlan: one(subscriptionPlans, {
    fields: [subscriptionEvents.toPlanId],
    references: [subscriptionPlans.id],
  }),
}));

// Type exports
export type SubscriptionEvent = typeof subscriptionEvents.$inferSelect;
export type NewSubscriptionEvent = typeof subscriptionEvents.$inferInsert;

