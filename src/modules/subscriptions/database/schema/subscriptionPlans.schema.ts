/**
 * Subscription Plans Schema
 *
 * Stores subscription plan definitions synced from Stripe products.
 * Prices are normalized to subscriptionPrices table.
 */

import { pgTable, text, timestamp, boolean, integer, uuid, jsonb, index } from 'drizzle-orm/pg-core';

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    display_name: text('display_name').notNull(),
    description: text('description'),

    // Stripe ID (product ID)
    stripe_product_id: text('stripe_product_id').notNull().unique(),

    // Features and Limits
    features: jsonb('features').$type<string[]>().notNull().default([]),
    limits: jsonb('limits')
      .$type<{
        users: number;
        invoices_per_month: number;
        storage_gb: number;
      }>()
      .notNull()
      .default({ users: -1, invoices_per_month: -1, storage_gb: 10 }),

    // Display settings
    is_active: boolean('is_active').default(true).notNull(),
    is_public: boolean('is_public').default(true).notNull(),
    sort_order: integer('sort_order').default(0).notNull(),

    // Additional metadata from Stripe
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),
    image: text('image'),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscription_plans_name_idx').on(table.name),
    index('subscription_plans_active_sort_idx').on(table.is_active, table.sort_order),
    index('subscription_plans_stripe_product_idx').on(table.stripe_product_id),
  ]
);

// Type exports
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
