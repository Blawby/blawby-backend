/**
 * Subscription Line Items Schema
 *
 * Stores individual line items for Better Auth subscriptions
 * Links to Better Auth's subscriptions table
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  integer,
  uuid,
  decimal,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

// Item type enum
export const SUBSCRIPTION_ITEM_TYPES = [
  'base_fee',
  'metered_users',
  'metered_invoice_fee',
  'metered_payout_fee',
  'metered_custom_payment_fee',
] as const;

export type SubscriptionItemType = typeof SUBSCRIPTION_ITEM_TYPES[number];

export const subscriptionLineItems = pgTable(
  'subscription_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to Better Auth subscription
    subscriptionId: text('subscription_id').notNull(),

    // Stripe IDs
    stripeSubscriptionItemId: text('stripe_subscription_item_id').notNull().unique(),
    stripePriceId: text('stripe_price_id').notNull(),

    // Item details
    itemType: text('item_type').$type<SubscriptionItemType>().notNull(),
    description: text('description'),
    quantity: integer('quantity').default(1).notNull(),
    unitAmount: decimal('unit_amount', { precision: 10, scale: 2 }),

    // Additional metadata
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscription_line_items_subscription_idx').on(table.subscriptionId),
    index('subscription_line_items_stripe_item_idx').on(table.stripeSubscriptionItemId),
  ],
);

export const subscriptionLineItemsRelations = relations(subscriptionLineItems, ({ one }) => ({
  plan: one(subscriptionPlans, {
    fields: [subscriptionLineItems.stripePriceId],
    references: [subscriptionPlans.stripeMonthlyPriceId],
  }),
}));

// Import related schemas for relations
import { subscriptionPlans } from './subscriptionPlans.schema';

// Type exports
export type SubscriptionLineItem = typeof subscriptionLineItems.$inferSelect;
export type NewSubscriptionLineItem = typeof subscriptionLineItems.$inferInsert;

