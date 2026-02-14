import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { matterExpenses } from '@/modules/matters/database/schema/matter-expenses.schema';
import { matterTimeEntries } from '@/modules/matters/database/schema/matter-time-entries.schema';

export const invoiceLineItems = pgTable(
  'invoice_line_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    invoice_id: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),

    type: varchar('type', { length: 20 }).notNull(), // service, time_entry, expense, flat_fee, retainer, other
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unit_price: integer('unit_price').notNull().default(0), // in cents
    line_total: integer('line_total').notNull().default(0), // in cents

    time_entry_id: uuid('time_entry_id').references(() => matterTimeEntries.id, {
      onDelete: 'set null',
    }),
    expense_id: uuid('expense_id').references(() => matterExpenses.id, {
      onDelete: 'set null',
    }),

    sort_order: integer('sort_order').notNull().default(0),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('invoice_line_items_invoice_idx').on(table.invoice_id),
    index('invoice_line_items_time_entry_idx').on(table.time_entry_id),
    index('invoice_line_items_expense_idx').on(table.expense_id),
  ],
);

export const invoiceLineItemsRelations = relations(invoiceLineItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceLineItems.invoice_id],
    references: [invoices.id],
  }),
  timeEntry: one(matterTimeEntries, {
    fields: [invoiceLineItems.time_entry_id],
    references: [matterTimeEntries.id],
  }),
  expense: one(matterExpenses, {
    fields: [invoiceLineItems.expense_id],
    references: [matterExpenses.id],
  }),
}));

export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;
export type SelectInvoiceLineItem = typeof invoiceLineItems.$inferSelect;
