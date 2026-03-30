/**
 * Subscription Prices Schema
 *
 * Normalized table storing every Stripe Price for subscription products.
 * Links to subscription_plans via plan_id FK.
 */

import { pgTable, text, timestamp, integer, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';

export const subscriptionPrices = pgTable(
  'subscription_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Link to subscription plan
    plan_id: uuid('plan_id'),

    // Stripe identifiers
    stripe_price_id: text('stripe_price_id').notNull().unique(),
    stripe_product_id: text('stripe_product_id').notNull(),

    // Price details
    currency: text('currency').notNull(),
    unit_amount: integer('unit_amount').default(0).notNull(), // in cents

    // Recurring information
    interval: text('interval'), // 'month' | 'year'
    interval_count: integer('interval_count').default(1),

    // Usage type
    usage_type: text('usage_type'), // 'licensed' | 'metered'
    billing_scheme: text('billing_scheme'),

    // Metered-specific fields
    meter_id: text('meter_id'),
    meter_name: text('meter_name'),
    internal_type: text('internal_type'), // our internal metered type constant

    // Our own control flag (independent from Stripe)
    is_active: boolean('is_active').default(true).notNull(),

    // Metadata
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscription_prices_plan_idx').on(table.plan_id),
    index('subscription_prices_stripe_price_idx').on(table.stripe_price_id),
    index('subscription_prices_product_idx').on(table.stripe_product_id),
  ]
);

// Type exports
export type SubscriptionPrice = typeof subscriptionPrices.$inferSelect;
export type NewSubscriptionPrice = typeof subscriptionPrices.$inferInsert;
