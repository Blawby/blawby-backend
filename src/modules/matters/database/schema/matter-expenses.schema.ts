import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  date,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { matters } from '@/modules/matters/database/schema/matters.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { users } from '@/schema';

export const matterExpenses = pgTable(
  'matter_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),
    description: varchar('description', { length: 255 }).notNull(),
    amount: integer('amount').notNull(), // in cents
    date: date('date').notNull(),
    billable: boolean('billable').notNull().default(true),
    invoice_id: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    invoiced_at: timestamp('invoiced_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_expenses_matter_idx').on(table.matter_id),
    index('matter_expenses_user_idx').on(table.user_id),
    index('matter_expenses_date_idx').on(table.date),
    index('matter_expenses_billable_idx').on(table.billable),
  ],
);

// Define relations
export const matterExpensesRelations = relations(matterExpenses, ({ one }) => ({
  matter: one(matters, {
    fields: [matterExpenses.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterExpenses.user_id],
    references: [users.id],
  }),
}));

export type InsertMatterExpense = typeof matterExpenses.$inferInsert;
export type SelectMatterExpense = typeof matterExpenses.$inferSelect;
