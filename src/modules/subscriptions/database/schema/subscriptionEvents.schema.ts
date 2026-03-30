/**
 * Subscription Events Schema
 *
 * Audit trail for subscription lifecycle events
 */

import { pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { subscriptions } from '@/schema/better-auth-schema';
import type {
  SubscriptionEventType,
  SubscriptionTriggeredByType,
} from '@/modules/subscriptions/types/SubscriptionEvents';

export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to Better Auth subscription
    subscription_id: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    // Link to plan (optional, for plan changes)
    plan_id: uuid('plan_id'),

    // Event details
    event_type: text('event_type').$type<SubscriptionEventType>().notNull(),
    from_status: text('from_status'),
    to_status: text('to_status'),
    from_plan_id: uuid('from_plan_id'),
    to_plan_id: uuid('to_plan_id'),

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
