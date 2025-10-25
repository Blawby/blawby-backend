import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { ulid } from 'ulid';
import { z } from 'zod';

import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations } from '@/schema';

export const intakePayments = pgTable(
  'intake_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ulid: text('ulid').notNull().unique().$defaultFn(() => ulid()),

    // Relations
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    connectedAccountId: uuid('connected_account_id')
      .notNull()
      .references(() => stripeConnectedAccounts.id, { onDelete: 'restrict' }),

    // Stripe IDs
    stripePaymentIntentId: text('stripe_payment_intent_id').notNull().unique(),
    stripeChargeId: text('stripe_charge_id'),

    // Payment Details (amounts in cents)
    amount: integer('amount').notNull(),
    applicationFee: integer('application_fee'),
    currency: text('currency').notNull().default('usd'),
    status: text('status').notNull(),

    // Customer Data
    metadata: jsonb('metadata').$type<IntakePaymentMetadata>(),

    // Security & Tracking
    customerIp: text('customer_ip'),
    userAgent: text('user_agent'),

    // Timestamps
    succeededAt: timestamp('succeeded_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('intake_payments_org_idx').on(table.organizationId),
    index('intake_payments_stripe_intent_idx').on(table.stripePaymentIntentId),
    index('intake_payments_ulid_idx').on(table.ulid),
    index('intake_payments_status_idx').on(table.status),
    index('intake_payments_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const intakePaymentsRelations = relations(
  intakePayments,
  ({ one }) => ({
    organization: one(organizations, {
      fields: [intakePayments.organizationId],
      references: [organizations.id],
    }),
    connectedAccount: one(stripeConnectedAccounts, {
      fields: [intakePayments.connectedAccountId],
      references: [stripeConnectedAccounts.id],
    }),
  }),
);


export type InsertIntakePayment = typeof intakePayments.$inferInsert;
export type SelectIntakePayment = typeof intakePayments.$inferSelect;

// Define metadata schema and type using Zod
const intakePaymentMetadataSchema = z.object({
  email: z.email(),
  name: z.string().min(1),
  phone: z.string().optional(),
  onBehalfOf: z.string().optional(),
  description: z.string().optional(),
});

export type IntakePaymentMetadata = z.infer<typeof intakePaymentMetadataSchema>;
