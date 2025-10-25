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

// TypeScript types for JSON fields
export type CompanyInfo = {
  name?: string;
  tax_id?: string;
  address?: OnboardingAddress;
};

export type IndividualInfo = {
  first_name?: string;
  last_name?: string;
  email?: string;
  dob?: { day?: number; month?: number; year?: number };
  ssn_last_4?: string;
  address?: OnboardingAddress;
};

export type OnboardingAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type Requirements = {
  currently_due: string[];
  eventually_due: string[];
  past_due: string[];
  pending_verification: string[];
  current_deadline?: number | null;
  disabled_reason?: string | null;
};

export type Capabilities = {
  card_payments?: string;
  transfers?: string;
  us_bank_account_ach_payments?: string;
};

export type ExternalAccount = {
  id: string;
  object: string;
  account?: string;
  account_holder_name?: string;
  account_holder_type?: string;
  bank_name?: string;
  country?: string;
  currency?: string;
  default_for_currency?: boolean;
  fingerprint?: string;
  last_4?: string;
  metadata?: Record<string, string>;
  routing_number?: string;
  status?: string;
};

export type ExternalAccounts = {
  object: 'list';
  data: ExternalAccount[];
};

// Stripe connected accounts table
export const stripeConnectedAccounts = pgTable('stripe_connected_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organization_id: text('organization_id')
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
  metadata: json('metadata').$type<Record<string, string>>(),
  onboarding_completed_at: timestamp('onboarding_completed_at'),
  last_refreshed_at: timestamp('last_refreshed_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
});

// Zod schemas for validation
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

// Request/Response schemas
export const createAccountRequestSchema = z.object({
  email: z.email(),
  country: z.string().length(2).default('US'),
});

export const createAccountResponseSchema = z.object({
  account_id: z.string(),
  client_secret: z.string().nullable(),
  expires_at: z.number(),
  session_status: z.enum(['valid', 'expired', 'created']),
  status: z.object({
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    details_submitted: z.boolean(),
  }),
});

export const getAccountResponseSchema = z.object({
  accountId: z.string(),
  status: z.object({
    charges_enabled: z.boolean(),
    payouts_enabled: z.boolean(),
    details_submitted: z.boolean(),
    is_active: z.boolean(),
  }),
  requirements: z.any().optional(),
  onboarding_completed_at: z.string().nullable(),
});

export const createSessionResponseSchema = z.object({
  client_secret: z.string(),
  expires_at: z.number(),
});

export const webhookResponseSchema = z.object({
  received: z.boolean(),
  already_processed: z.boolean().optional(),
});

// Export types
export type StripeConnectedAccount
  = typeof stripeConnectedAccounts.$inferSelect;
export type NewStripeConnectedAccount
  = typeof stripeConnectedAccounts.$inferInsert;
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;
export type CreateAccountResponse = z.infer<typeof createAccountResponseSchema>;
export type GetAccountResponse = z.infer<typeof getAccountResponseSchema>;
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;
export type WebhookResponse = z.infer<typeof webhookResponseSchema>;

// Main export
export { stripeConnectedAccounts as default };
