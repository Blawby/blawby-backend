import { relations, sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, text, timestamp, jsonb, index, check } from 'drizzle-orm/pg-core';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { organizations, users } from '@/schema/better-auth-schema';

export const trustTransactions = pgTable(
  'trust_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    client_id: uuid('client_id')
      .notNull()
      .references(() => userDetails.id),
    matter_id: uuid('matter_id').references(() => matters.id),
    transaction_type: varchar('transaction_type', { length: 50 }).notNull(),
    amount: integer('amount').notNull(), // Cents
    balance_after: integer('balance_after').notNull(), // Running balance in cents
    description: text('description'),
    source: varchar('source', { length: 100 }),
    invoice_id: uuid('invoice_id').references(() => invoices.id),
    stripe_payment_intent_id: varchar('stripe_payment_intent_id', { length: 255 }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (table) => [
    index('idx_trust_transactions_client').on(table.client_id),
    index('idx_trust_transactions_matter').on(table.matter_id),
    index('idx_trust_transactions_invoice').on(table.invoice_id),
    index('idx_trust_transactions_org').on(table.organization_id),
    // Composite index for balance lookups per client/org ordered by recency (IOLTA compliance)
    index('idx_trust_transactions_org_client_created').on(table.organization_id, table.client_id, table.created_at),
    check('trust_txn_type_check', sql`transaction_type IN ('deposit', 'withdrawal', 'transfer', 'refund')`),
  ]
);

export const trustTransactionsRelations = relations(trustTransactions, ({ one }) => ({
  organization: one(organizations, {
    fields: [trustTransactions.organization_id],
    references: [organizations.id],
  }),
  client: one(userDetails, {
    fields: [trustTransactions.client_id],
    references: [userDetails.id],
  }),
  matter: one(matters, {
    fields: [trustTransactions.matter_id],
    references: [matters.id],
  }),
  invoice: one(invoices, {
    fields: [trustTransactions.invoice_id],
    references: [invoices.id],
  }),
  createdBy: one(users, {
    fields: [trustTransactions.created_by],
    references: [users.id],
  }),
}));

export type InsertTrustTransaction = typeof trustTransactions.$inferInsert;
export type SelectTrustTransaction = typeof trustTransactions.$inferSelect;
