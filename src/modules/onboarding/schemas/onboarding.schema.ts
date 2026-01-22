import {
  pgTable,
  uuid,
  text,
  json,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { organizations } from '@/schema';
import type {
  CompanyInfo,
  IndividualInfo,
  Requirements,
  Capabilities,
  ExternalAccounts,
  FutureRequirements,
  TosAcceptance,
} from '@/modules/onboarding/types/onboarding.types';

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
  company: json('company').$type<CompanyInfo>(),
  individual: json('individual').$type<IndividualInfo>(),
  requirements: json('requirements').$type<Requirements>(),
  capabilities: json('capabilities').$type<Capabilities>(),
  externalAccounts: json('external_accounts').$type<ExternalAccounts>(),
  futureRequirements: json('future_requirements').$type<FutureRequirements>(),
  tosAcceptance: json('tos_acceptance').$type<TosAcceptance>(),
  metadata: json('metadata').$type<Record<string, string>>(),
  onboarding_completed_at: timestamp('onboarding_completed_at'),
  last_refreshed_at: timestamp('last_refreshed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Zod schemas for database interaction
export const createStripeConnectedAccountSchema = createInsertSchema(
  stripeConnectedAccounts,
  {
    email: z.string().email('Invalid email format'),
    country: z.string().length(2),
    business_type: z
      .enum(['individual', 'company', 'non_profit', 'government_entity'])
      .optional(),
  },
);

export const updateStripeConnectedAccountSchema = createInsertSchema(
  stripeConnectedAccounts,
  {
    email: z.string().email().optional(),
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
