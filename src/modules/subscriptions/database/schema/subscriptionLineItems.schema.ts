/**
 * Subscription Line Items Schema
 *
 * Stores individual line items for Better Auth subscriptions
 * Links to Better Auth's subscriptions table
 */

import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp, integer, uuid, decimal, jsonb, index } from 'drizzle-orm/pg-core';
import { subscriptionPrices } from '@/modules/subscriptions/database/schema/subscriptionPrices.schema';
import { subscriptions } from '@/schema/better-auth-schema';

// Item type enum
export const SUBSCRIPTION_ITEM_TYPES = [
  'base_fee',
  'metered_users',
  'metered_invoice_fee',
  'metered_payout_fee',
  'metered_custom_payment_fee',
] as const;

export type SubscriptionItemType = (typeof SUBSCRIPTION_ITEM_TYPES)[number];

export const subscriptionLineItems = pgTable(
  'subscription_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to Better Auth subscription
    subscription_id: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),

    // Stripe IDs
    stripe_subscription_item_id: text('stripe_subscription_item_id').notNull().unique(),
    stripe_price_id: text('stripe_price_id').notNull(),

    // Item details
    item_type: text('item_type').$type<SubscriptionItemType>().notNull(),
    description: text('description'),
    quantity: integer('quantity').default(1).notNull(),
    unit_amount: decimal('unit_amount', { precision: 10, scale: 2 }),

    // Additional metadata
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscription_line_items_subscription_idx').on(table.subscription_id),
    index('subscription_line_items_stripe_item_idx').on(table.stripe_subscription_item_id),
  ]
);

export const subscriptionLineItemsRelations = relations(subscriptionLineItems, ({ one }) => ({
  price: one(subscriptionPrices, {
    fields: [subscriptionLineItems.stripe_price_id],
    references: [subscriptionPrices.stripe_price_id],
  }),
}));

// Type exports
export type SubscriptionLineItem = typeof subscriptionLineItems.$inferSelect;
export type NewSubscriptionLineItem = typeof subscriptionLineItems.$inferInsert;
