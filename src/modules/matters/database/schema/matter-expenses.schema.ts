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

import { users } from '@/schema';
import { matters } from './matters.schema';

export const matterExpenses = pgTable(
  'matter_expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
      }),
    description: varchar('description', { length: 255 }).notNull(),
    amount: integer('amount').notNull(), // in cents
    date: date('date').notNull(),
    billable: boolean('billable').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_expenses_matter_idx').on(table.matterId),
    index('matter_expenses_user_idx').on(table.userId),
    index('matter_expenses_date_idx').on(table.date),
    index('matter_expenses_billable_idx').on(table.billable),
  ],
);

// Define relations
export const matterExpensesRelations = relations(matterExpenses, ({ one }) => ({
  matter: one(matters, {
    fields: [matterExpenses.matterId],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterExpenses.userId],
    references: [users.id],
  }),
}));

export type InsertMatterExpense = typeof matterExpenses.$inferInsert;
export type SelectMatterExpense = typeof matterExpenses.$inferSelect;
