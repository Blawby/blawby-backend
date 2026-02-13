import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { billingTransactions } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { invoiceLineItems } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import { paymentLinks } from '@/modules/invoices/database/schema/payment-links.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { stripeConnectedAccounts } from '@/modules/onboarding/schemas/onboarding.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { organizations, users } from '@/schema';

export const invoiceTypeEnum = pgEnum('invoice_type', [
  'flat_fee', // Earned upon receipt → operating
  'phase_fee', // Earned upon receipt per phase → operating
  'retainer_deposit', // Client funds → trust (lawyer routes internally)
]);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    client_id: uuid('client_id')
      .notNull()
      .references(() => userDetails.id, { onDelete: 'cascade' }),
    matter_id: uuid('matter_id').references(() => matters.id, {
      onDelete: 'set null',
    }),
    connected_account_id: uuid('connected_account_id')
      .notNull()
      .references(() => stripeConnectedAccounts.id, { onDelete: 'restrict' }),

    invoice_number: varchar('invoice_number', { length: 50 }).notNull(),
    invoice_type: invoiceTypeEnum('invoice_type').notNull().default('flat_fee'),
    fund_destination: varchar('fund_destination', { length: 20 })
      .notNull()
      .default('operating'), // 'operating' | 'trust'
    status: varchar('status', { length: 20 })
      .notNull()
      .default('draft'), // draft, pending, sent, paid, overdue, cancelled

    subtotal: integer('subtotal').notNull().default(0),
    tax_amount: integer('tax_amount').notNull().default(0),
    discount_amount: integer('discount_amount').notNull().default(0),
    total: integer('total').notNull().default(0),
    amount_paid: integer('amount_paid').notNull().default(0),
    amount_due: integer('amount_due').notNull().default(0),

    issue_date: timestamp('issue_date', { withTimezone: true, mode: 'date' }),
    due_date: timestamp('due_date', { withTimezone: true, mode: 'date' }),
    paid_at: timestamp('paid_at', { withTimezone: true, mode: 'date' }),

    stripe_invoice_id: varchar('stripe_invoice_id', { length: 255 }),
    stripe_payment_intent_id: varchar('stripe_payment_intent_id', { length: 255 }),
    stripe_hosted_invoice_url: text('stripe_hosted_invoice_url'),

    notes: text('notes'),
    memo: text('memo'),
    payment_from_retainer: integer('payment_from_retainer').notNull().default(0),

    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('invoices_org_idx').on(table.organization_id),
    index('invoices_client_idx').on(table.client_id),
    index('invoices_matter_idx').on(table.matter_id),
    index('invoices_status_idx').on(table.status),
    index('invoices_type_idx').on(table.invoice_type),
    index('invoices_number_idx').on(table.invoice_number),
    index('invoices_stripe_id_idx').on(table.stripe_invoice_id),
    uniqueIndex('invoices_org_number_unique_idx').on(
      table.organization_id,
      table.invoice_number,
    ),
    uniqueIndex('invoices_stripe_invoice_unique_idx').on(table.stripe_invoice_id),
  ],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [invoices.organization_id],
    references: [organizations.id],
  }),
  client: one(userDetails, {
    fields: [invoices.client_id],
    references: [userDetails.id],
  }),
  matter: one(matters, {
    fields: [invoices.matter_id],
    references: [matters.id],
  }),
  connectedAccount: one(stripeConnectedAccounts, {
    fields: [invoices.connected_account_id],
    references: [stripeConnectedAccounts.id],
  }),
  deletedByUser: one(users, {
    fields: [invoices.deleted_by],
    references: [users.id],
  }),
  lineItems: many(invoiceLineItems),
  paymentLinks: many(paymentLinks),
  transactions: many(billingTransactions),
}));

export type InsertInvoice = typeof invoices.$inferInsert;
export type SelectInvoice = typeof invoices.$inferSelect;
