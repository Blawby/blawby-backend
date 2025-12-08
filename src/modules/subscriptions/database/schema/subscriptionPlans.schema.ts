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

export const subscriptionPlans = pgTable(
  'subscription_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull().unique(),
    displayName: text('display_name').notNull(),
    description: text('description'),

    // Stripe IDs
    stripeProductId: text('stripe_product_id').notNull().unique(),
    stripeMonthlyPriceId: text('stripe_monthly_price_id'),
    stripeYearlyPriceId: text('stripe_yearly_price_id'),

    // Pricing
    monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }),
    yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }),
    currency: text('currency').default('usd').notNull(),

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
    meteredItems: jsonb('metered_items')
      .$type<
        Array<{
          priceId: string;
          meterName: string;
          type: string;
        }>
      >()
      .default([]),

    // Display settings
    isActive: boolean('is_active').default(true).notNull(),
    isPublic: boolean('is_public').default(true).notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),

    // Additional metadata from Stripe
    metadata: jsonb('metadata').$type<Record<string, string>>().default({}),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('subscription_plans_name_idx').on(table.name),
    index('subscription_plans_active_sort_idx').on(table.isActive, table.sortOrder),
    index('subscription_plans_stripe_product_idx').on(table.stripeProductId),
    uniqueIndex('subscription_plans_stripe_monthly_price_idx').on(table.stripeMonthlyPriceId),
    uniqueIndex('subscription_plans_stripe_yearly_price_idx').on(table.stripeYearlyPriceId),
  ],
);

export const subscriptionPlansRelations = relations(subscriptionPlans, ({ many }) => ({
  lineItems: many(subscriptionLineItems),
  events: many(subscriptionEvents),
}));

// Import related schemas for relations
import { subscriptionLineItems } from './subscriptionLineItems.schema';
import { subscriptionEvents } from './subscriptionEvents.schema';

// Type exports
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

