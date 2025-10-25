/**
 * Stripe Customers Schema
 *
 * Stores Stripe customer information and user profile data
 * Separate from users table for better separation of concerns
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  index,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { users } from '@/schema/better-auth-schema';

// Product usage options enum
export const PRODUCT_USAGE_OPTIONS = [
  'family_law',
  'criminal_defense',
  'personal_injury',
  'estate_planning',
  'business_law',
  'real_estate',
  'immigration',
  'bankruptcy',
  'other',
] as const;

export type ProductUsage = typeof PRODUCT_USAGE_OPTIONS[number];

// Zod schema for product usage validation
const productUsageSchema = z.array(
  z.enum(PRODUCT_USAGE_OPTIONS),
).max(5);

export const customerDetails = pgTable(
  'customer_details',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Stripe
    stripeCustomerId: text('stripe_customer_id').notNull().unique(),

    // User profile
    phone: text('phone'),
    dob: timestamp('dob', { mode: 'date' }), // Date of birth
    productUsage: jsonb('product_usage').$type<ProductUsage[]>(), // Multi-select

    // Future expansion

    // Metadata
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('customer_details_user_idx').on(table.userId),
    index('customer_details_stripe_customer_idx').on(table.stripeCustomerId),
    index('customer_details_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const customerDetailsRelations = relations(
  customerDetails,
  ({ one }) => ({
    user: one(users, {
      fields: [customerDetails.userId],
      references: [users.id],
    }),
  }),
);

// Zod schemas for validation
export const insertCustomerDetailsSchema = createInsertSchema(customerDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  productUsage: productUsageSchema.optional(),
});

export const selectCustomerDetailsSchema = createSelectSchema(customerDetails).extend({
  productUsage: productUsageSchema.optional(),
});

// Update schema (all fields optional except id)
export const updateCustomerDetailsSchema = insertCustomerDetailsSchema.partial();

// Infer types from schemas
export type CustomerDetails = typeof customerDetails.$inferSelect;
export type InsertCustomerDetails = typeof customerDetails.$inferInsert;
export type UpdateCustomerDetails = z.infer<typeof updateCustomerDetailsSchema>;
