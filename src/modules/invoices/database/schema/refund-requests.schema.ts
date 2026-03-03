import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { userDetails } from '@/modules/user-details/database/schema/user-details.schema';
import { organizations, users } from '@/schema';

export const refundRequests = pgTable(
  'refund_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    invoice_id: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id),
    client_user_details_id: uuid('client_user_details_id')
      .notNull()
      .references(() => userDetails.id),
    requested_amount: integer('requested_amount').notNull(), // cents
    currency: varchar('currency', { length: 10 }).notNull().default('usd'),
    reason: text('reason').notNull(),
    notes: text('notes'),
    status: varchar('status', { length: 50 }).notNull().default('requested'),

    // Populated on execution
    stripe_refund_id: varchar('stripe_refund_id', { length: 255 }),
    stripe_payment_intent_id: varchar('stripe_payment_intent_id', { length: 255 }),
    executed_amount: integer('executed_amount'),
    executed_at: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    executed_by_user_id: uuid('executed_by_user_id').references(() => users.id),

    // Populated on approval/rejection
    reviewed_at: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }),
    reviewed_by_user_id: uuid('reviewed_by_user_id').references(() => users.id),
    review_notes: text('review_notes'),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_refund_requests_org').on(table.organization_id),
    index('idx_refund_requests_invoice').on(table.invoice_id),
    index('idx_refund_requests_client').on(table.client_user_details_id),
    index('idx_refund_requests_status').on(table.status),
    check('refund_status_check', sql`status IN ('requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled')`),
  ],
);

export const refundRequestsRelations = relations(refundRequests, ({ one }) => ({
  organization: one(organizations, {
    fields: [refundRequests.organization_id],
    references: [organizations.id],
  }),
  invoice: one(invoices, {
    fields: [refundRequests.invoice_id],
    references: [invoices.id],
  }),
  executedByUser: one(users, {
    fields: [refundRequests.executed_by_user_id],
    references: [users.id],
    relationName: 'executedByUser',
  }),
  reviewedByUser: one(users, {
    fields: [refundRequests.reviewed_by_user_id],
    references: [users.id],
    relationName: 'reviewedByUser',
  }),
}));

export type InsertRefundRequest = typeof refundRequests.$inferInsert;
export type SelectRefundRequest = typeof refundRequests.$inferSelect;
