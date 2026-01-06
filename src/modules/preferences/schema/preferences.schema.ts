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

// Product usage options enum (kept for backward compatibility during migration)
export const PRODUCT_USAGE_OPTIONS = [
  'personal_legal_issue',
  'business_legal_needs',
  'legal_research',
  'document_review',
  'others',
] as const;

export type ProductUsage = typeof PRODUCT_USAGE_OPTIONS[number];

// TypeScript types for JSONB columns
export type GeneralPreferences = {
  theme?: string; // 'light' | 'dark' | 'system'
  accent_color?: string; // hex color
  language?: string; // 'en' | 'es' | etc.
  spoken_language?: string; // for voice/audio features
  timezone?: string; // 'America/New_York'
  date_format?: string; // 'MM/DD/YYYY' | 'DD/MM/YYYY'
  time_format?: string; // '12h' | '24h'
};

export type NotificationPreferences = {
  responses_push?: boolean;
  tasks_push?: boolean;
  tasks_email?: boolean;
  messaging_push?: boolean;
};

export type SecurityPreferences = {
  two_factor_enabled?: boolean;
  email_notifications?: boolean;
  login_alerts?: boolean;
  session_timeout?: number; // minutes
};

export type AccountPreferences = {
  selected_domain?: string | null;
  custom_domains?: string | null;
  receive_feedback_emails?: boolean;
  marketing_emails?: boolean;
  security_alerts?: boolean;
};

export type OnboardingPreferences = {
  birthday?: string; // ISO date string
  primary_use_case?: string;
  use_case_additional_info?: string;
  completed?: boolean;
  product_usage?: ProductUsage[]; // Migrated from old product_usage column
};

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

// Preference category type
export type PreferenceCategory = 'general' | 'notifications' | 'security' | 'account' | 'onboarding' | 'profile';

