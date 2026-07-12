import { organizations, users } from '@/schema/better-auth-schema';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

export const trustReconciliations = pgTable(
  'trust_reconciliations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    idempotency_key: uuid('idempotency_key').notNull(),
    statement_ending_at: timestamp('statement_ending_at', { withTimezone: true, mode: 'date' }).notNull(),
    bank_statement_balance: integer('bank_statement_balance').notNull(),
    trust_book_balance: integer('trust_book_balance').notNull(),
    client_ledger_balance: integer('client_ledger_balance').notNull(),
    bank_to_book_variance: integer('bank_to_book_variance').notNull(),
    book_to_client_variance: integer('book_to_client_variance').notNull(),
    status: varchar('status', { length: 20 }).notNull(),
    source: varchar('source', { length: 30 }).notNull().default('manual_statement'),
    notes: text('notes'),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('trust_reconciliations_org_idempotency_idx').on(table.organization_id, table.idempotency_key),
    index('trust_reconciliations_org_created_idx').on(table.organization_id, table.created_at),
    index('trust_reconciliations_org_statement_idx').on(table.organization_id, table.statement_ending_at),
    check('trust_reconciliations_bank_balance_non_negative', sql`${table.bank_statement_balance} >= 0`),
    check('trust_reconciliations_book_balance_non_negative', sql`${table.trust_book_balance} >= 0`),
    check('trust_reconciliations_client_balance_non_negative', sql`${table.client_ledger_balance} >= 0`),
    check('trust_reconciliations_status_check', sql`${table.status} IN ('balanced', 'variance')`),
    check('trust_reconciliations_source_check', sql`${table.source} IN ('manual_statement', 'bank_integration')`),
  ]
);

export const trustReconciliationsRelations = relations(trustReconciliations, ({ one }) => ({
  organization: one(organizations, {
    fields: [trustReconciliations.organization_id],
    references: [organizations.id],
  }),
  createdBy: one(users, {
    fields: [trustReconciliations.created_by],
    references: [users.id],
  }),
}));

export type InsertTrustReconciliation = typeof trustReconciliations.$inferInsert;
export type SelectTrustReconciliation = typeof trustReconciliations.$inferSelect;
