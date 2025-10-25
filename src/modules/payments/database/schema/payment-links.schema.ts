import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { organizations } from '@/schema';

export const paymentLinks = pgTable(
  'payment_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ulid: text('ulid').notNull().unique(),

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
    metadata: jsonb('metadata').$type<{
      email: string;
      name: string;
      on_behalf_of?: string;
    } | null>(),

    // Security
    customerIp: text('customer_ip'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('payment_links_org_idx').on(table.organizationId),
    index('payment_links_org_status_idx').on(table.organizationId, table.status),
    index('payment_links_stripe_intent_idx').on(table.stripePaymentIntentId),
    index('payment_links_connected_account_idx').on(table.connectedAccountId),
    index('payment_links_created_at_idx').on(table.createdAt),
  ],
);

// Validation schemas
export const insertPaymentLinkSchema = createInsertSchema(paymentLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const selectPaymentLinkSchema = createSelectSchema(paymentLinks);

export type InsertPaymentLink = z.infer<typeof insertPaymentLinkSchema>;
export type SelectPaymentLink = z.infer<typeof selectPaymentLinkSchema>;
