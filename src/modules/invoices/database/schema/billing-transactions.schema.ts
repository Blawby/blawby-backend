import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { organizations } from '@/schema';

export const billingTransactions = pgTable(
  'billing_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    invoice_id: uuid('invoice_id').references(() => invoices.id, {
      onDelete: 'set null',
    }),
    matter_id: uuid('matter_id').references(() => matters.id, {
      onDelete: 'set null',
    }),
    stripe_transfer_id: text('stripe_transfer_id').unique(),
    destination_account_id: text('destination_account_id').notNull(),
    amount: integer('amount').notNull(), // in cents
    application_fee_amount: integer('application_fee_amount').notNull().default(0),
    type: text('type', { enum: ['payout', 'retainer_draw', 'refund'] }).notNull(),
    status: text('status', {
      enum: ['pending', 'queued', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    retry_count: integer('retry_count').notNull().default(0),
    last_error: text('last_error'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('billing_transactions_invoice_idx').on(table.invoice_id),
    index('billing_transactions_matter_idx').on(table.matter_id),
    index('billing_transactions_stripe_transfer_idx').on(table.stripe_transfer_id),
    index('billing_transactions_status_idx').on(table.status),
  ],
);

export const billingTransactionsRelations = relations(
  billingTransactions,
  ({ one }) => ({
    invoice: one(invoices, {
      fields: [billingTransactions.invoice_id],
      references: [invoices.id],
    }),
    matter: one(matters, {
      fields: [billingTransactions.matter_id],
      references: [matters.id],
    }),
  }),
);

export const billingTransactionsSchema = {
  billingTransactions,
  billingTransactionsRelations,
};

export type InsertBillingTransaction = typeof billingTransactions.$inferInsert;
export type SelectBillingTransaction = typeof billingTransactions.$inferSelect;
