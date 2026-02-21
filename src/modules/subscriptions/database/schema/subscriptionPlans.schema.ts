/**
 * Subscription Plans Schema
 *
 * Stores subscription plan definitions synced from Stripe products/prices
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  uuid,
  decimal,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { subscriptionEvents } from '@/modules/subscriptions/database/schema/subscriptionEvents.schema';
import { subscriptionLineItems } from '@/modules/subscriptions/database/schema/subscriptionLineItems.schema';

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    display_name: text('display_name').notNull(),
    description: text('description'),

    // Stripe IDs
    stripe_product_id: text('stripe_product_id').notNull().unique(),
    stripe_monthly_price_id: text('stripe_monthly_price_id'),
    stripe_yearly_price_id: text('stripe_yearly_price_id'),

    // Pricing
    monthly_price: decimal('monthly_price', { precision: 10, scale: 2 }),
    yearly_price: decimal('yearly_price', { precision: 10, scale: 2 }),
    currency: text('currency').default('usd').notNull(),
    image: text('image'),

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

    // Metered items configuration
    metered_items: jsonb('metered_items')
      .$type<
        Array<{
          price_id: string;
          meter_name: string;
          type: string;
        }>
      >()
      .default([]),

    // Display settings
    is_active: boolean('is_active').default(true).notNull(),
    is_public: boolean('is_public').default(true).notNull(),
    sort_order: integer('sort_order').default(0).notNull(),

    // Additional metadata from Stripe
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),

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
    uniqueIndex('subscription_plans_stripe_monthly_price_idx').on(table.stripe_monthly_price_id),
    uniqueIndex('subscription_plans_stripe_yearly_price_idx').on(table.stripe_yearly_price_id),
  ],
);

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  lineItems: many(subscriptionLineItems),
  events: many(subscriptionEvents),
}));

// Type exports
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

