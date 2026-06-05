import { pgTable, text, timestamp, integer, uuid, boolean, jsonb, index } from 'drizzle-orm/pg-core';

export const stripePrices = pgTable(
  'stripe_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),

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

    // Denormalized product display data (absorbed from subscription_plans)
    name: text('name'), // plan tier key e.g. "starter"; null for metered prices
    display_name: text('display_name'),
    description: text('description'),
    features: jsonb('features').$type<string[]>(),
    limits: jsonb('limits').$type<{ users: number; invoices_per_month: number; storage_gb: number }>(),
    is_public: boolean('is_public').default(true),
    sort_order: integer('sort_order').default(0),
    image: text('image'),

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
    index('stripe_prices_stripe_price_idx').on(table.stripe_price_id),
    index('stripe_prices_product_idx').on(table.stripe_product_id),
    index('stripe_prices_name_idx').on(table.name),
    index('stripe_prices_active_sort_idx').on(table.is_active, table.sort_order),
  ]
);

export type StripePrice = typeof stripePrices.$inferSelect;
export type NewStripePrice = typeof stripePrices.$inferInsert;
