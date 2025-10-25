import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  integer,
  pgEnum,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema, createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';

// Enums
export const paymentIntentStatusEnum = pgEnum('payment_intent_status', [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'requires_capture',
  'canceled',
  'succeeded',
] as const);

export const paymentIntents = pgTable(
  'payment_intents',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Relations
    connectedAccountId: uuid('connected_account_id').notNull(),
    customerId: uuid('customer_id'),
    invoiceId: uuid('invoice_id'),

    // Stripe
    stripePaymentIntentId: text('stripe_payment_intent_id').notNull().unique(),
    stripeChargeId: text('stripe_charge_id'),

    // Amounts (in cents)
    amount: integer('amount').notNull(),
    currency: text('currency').notNull().default('usd'),
    applicationFeeAmount: integer('application_fee_amount'),

    // Status
    status: paymentIntentStatusEnum('status').notNull(),

    // Payment Method
    paymentMethodId: text('payment_method_id'),
    paymentMethodType: text('payment_method_type'),

    // Customer Info (snapshot at time of payment)
    customerEmail: text('customer_email'),
    customerName: text('customer_name'),

    // Metadata from Stripe
    // oxlint-disable-next-line no-explicit-any
    metadata: jsonb('metadata').$type<Record<string, any>>(),

    // Receipt
    receiptEmail: text('receipt_email'),
    receiptUrl: text('receipt_url'),

    // Audit timestamps
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    succeededAt: timestamp('succeeded_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('payment_intents_connected_account_id_idx').on(table.connectedAccountId),
    index('payment_intents_org_status_idx').on(table.connectedAccountId, table.status),
    index('payment_intents_org_created_idx').on(table.connectedAccountId, table.createdAt),
    index('payment_intents_stripe_payment_intent_id_idx').on(table.stripePaymentIntentId),
    index('payment_intents_created_at_idx').on(table.createdAt),
    index('payment_intents_succeeded_at_idx').on(table.succeededAt),
    index('payment_intents_customer_id_idx').on(table.customerId),
    index('payment_intents_invoice_id_idx').on(table.invoiceId),
  ],
);

// Zod schemas for validation
export const insertPaymentIntentSchema = createInsertSchema(paymentIntents, {
  currency: z.string().length(3),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Select schemas
export const selectPaymentIntentSchema = createSelectSchema(paymentIntents);

// Type exports
export type InsertPaymentIntent = z.infer<typeof insertPaymentIntentSchema>;
export type SelectPaymentIntent = z.infer<typeof selectPaymentIntentSchema>;
