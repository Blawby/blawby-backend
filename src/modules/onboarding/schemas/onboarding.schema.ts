import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import type {
  CompanyInfo,
  IndividualInfo,
  Requirements,
  Capabilities,
  ExternalAccounts,
  FutureRequirements,
  TosAcceptance,
} from '@/modules/onboarding/types/onboarding.types';
import { organizations } from '@/schema/better-auth-schema';

// Stripe connected accounts table
export const stripeConnectedAccounts = pgTable('stripe_connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  stripe_account_id: text('account_id').notNull().unique(),
  account_type: text('account_type').default('custom').notNull(),
  country: text('country').default('US').notNull(),
  email: text('email').notNull(),
  charges_enabled: boolean('charges_enabled').default(false).notNull(),
  payouts_enabled: boolean('payouts_enabled').default(false).notNull(),
  details_submitted: boolean('details_submitted').default(false).notNull(),
  business_type: text('business_type'), // Stripe.Account.BusinessType
  company: jsonb('company').$type<CompanyInfo>(),
  individual: jsonb('individual').$type<IndividualInfo>(),
  requirements: jsonb('requirements').$type<Requirements>(),
  capabilities: jsonb('capabilities').$type<Capabilities>(),
  externalAccounts: jsonb('external_accounts').$type<ExternalAccounts>(),
  futureRequirements: jsonb('future_requirements').$type<FutureRequirements>(),
  tosAcceptance: jsonb('tos_acceptance').$type<TosAcceptance>(),
  metadata: jsonb('metadata').$type<Record<string, string>>(),
  onboarding_completed_at: timestamp('onboarding_completed_at', { withTimezone: true, mode: 'date' }),
  last_refreshed_at: timestamp('last_refreshed_at', { withTimezone: true, mode: 'date' }),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const stripeConnectedAccountsRelations = relations(
  stripeConnectedAccounts,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [stripeConnectedAccounts.organization_id],
      references: [organizations.id],
    }),
  }),
);

// Zod schemas for database interaction
export const createStripeConnectedAccountSchema = createInsertSchema(
  stripeConnectedAccounts,
  {
    email: z.email('Invalid email format'),
    country: z.string().length(2),
    business_type: z
      .enum(['individual', 'company', 'non_profit', 'government_entity'])
      .optional(),
  },
);

export const updateStripeConnectedAccountSchema = createInsertSchema(
  stripeConnectedAccounts,
  {
    email: z.email().optional(),
    country: z.string().length(2).optional(),
    business_type: z
      .enum(['individual', 'company', 'non_profit', 'government_entity'])
      .optional(),
  },
).partial();

export const selectStripeConnectedAccountSchema = createSelectSchema(
  stripeConnectedAccounts,
);

// Export types
export type StripeConnectedAccount
  = typeof stripeConnectedAccounts.$inferSelect;
export type NewStripeConnectedAccount
  = typeof stripeConnectedAccounts.$inferInsert;

// Main export
export { stripeConnectedAccounts as default };
