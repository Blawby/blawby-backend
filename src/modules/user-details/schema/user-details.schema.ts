/**
 * User Details Schema
 *
 * Stores user profile data and Stripe customer information
 * Separate from users table for better separation of concerns
 */

import { relations } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  date,
  index,
  uuid,
  jsonb,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { users } from '@/schema/better-auth-schema';

// Product usage options enum
export const PRODUCT_USAGE_OPTIONS = [
  'personal_legal_issue',
  'business_legal_needs',
  'legal_research',
  'document_review',
  'others',
] as const;

export type ProductUsage = typeof PRODUCT_USAGE_OPTIONS[number];

// Zod schema for product usage validation
const productUsageSchema = z.array(
  z.enum(PRODUCT_USAGE_OPTIONS),
).max(5);

export const userDetails = pgTable(
  'user_details',
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
    dob: date('dob'), // Date of birth (date only, no time)
    productUsage: jsonb('product_usage').$type<ProductUsage[]>(), // Multi-select

    // Future expansion

    // Metadata
    createdAt: timestamp('created_at')
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('user_details_user_idx').on(table.userId),
    index('user_details_stripe_customer_idx').on(table.stripeCustomerId),
    index('user_details_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const userDetailsRelations = relations(
  userDetails,
  ({ one }) => ({
    user: one(users, {
      fields: [userDetails.userId],
      references: [users.id],
    }),
  }),
);

// Zod schemas for validation
export const insertUserDetailsSchema = createInsertSchema(userDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  productUsage: productUsageSchema.optional(),
});

export const selectUserDetailsSchema = createSelectSchema(userDetails).extend({
  productUsage: productUsageSchema.optional(),
});

// Update schema (all fields optional except id)
export const updateUserDetailsSchema = insertUserDetailsSchema.partial();

// Infer types from schemas
export type UserDetails = typeof userDetails.$inferSelect;
export type InsertUserDetails = typeof userDetails.$inferInsert;
export type UpdateUserDetails = z.infer<typeof updateUserDetailsSchema>;
