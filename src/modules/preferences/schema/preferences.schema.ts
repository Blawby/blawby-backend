/**
 * Preferences Schema
 *
 * Stores user preferences, settings, onboarding data, and Stripe customer information
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
import type {
  GeneralPreferences,
  NotificationPreferences,
  SecurityPreferences,
  AccountPreferences,
  OnboardingPreferences,
  ProductUsage,
} from '@/modules/preferences/types/preferences.types';
import { PRODUCT_USAGE_OPTIONS } from '@/modules/preferences/types/preferences.types';

// Zod schema for product usage validation
const productUsageSchema = z.array(
  z.enum(PRODUCT_USAGE_OPTIONS),
).max(5);

export const preferences = pgTable(
  'preferences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),

    // JSONB category columns
    general: jsonb('general').$type<GeneralPreferences>().default({}),
    notifications: jsonb('notifications').$type<NotificationPreferences>().default({}),
    security: jsonb('security').$type<SecurityPreferences>().default({}),
    account: jsonb('account').$type<AccountPreferences>().default({}),
    onboarding: jsonb('onboarding').$type<OnboardingPreferences>().default({}),

    // Old field (temporary - will be removed after data migration)
    productUsage: jsonb('product_usage').$type<ProductUsage[]>(),

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
    index('preferences_user_idx').on(table.userId),
    index('preferences_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const preferencesRelations = relations(
  preferences,
  ({ one }) => ({
    user: one(users, {
      fields: [preferences.userId],
      references: [users.id],
    }),
  }),
);

// Zod schemas for validation
export const insertPreferencesSchema = createInsertSchema(preferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  productUsage: productUsageSchema.optional(),
});

export const selectPreferencesSchema = createSelectSchema(preferences).extend({
  productUsage: productUsageSchema.optional(),
});

// Update schema (all fields optional except id)
export const updatePreferencesSchema = insertPreferencesSchema.partial();

// Infer types from schemas
export type Preferences = typeof preferences.$inferSelect;
export type InsertPreferences = typeof preferences.$inferInsert;
export type UpdatePreferences = z.infer<typeof updatePreferencesSchema>;

