import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { matters } from './matters.schema';
import { invoices } from '@/modules/invoices/database/schema/invoices.schema';
import { users } from '@/schema/better-auth-schema';

export const matterTimeEntries = pgTable(
  'matter_time_entries',
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
    start_time: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
    end_time: timestamp('end_time', { withTimezone: true, mode: 'date' }).notNull(),
    duration: integer('duration').notNull(),
    description: text('description'),
    billable: boolean('billable').notNull().default(true),
    invoice_id: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    invoiced_at: timestamp('invoiced_at', { withTimezone: true, mode: 'date' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matter_time_entries_matter_idx').on(table.matter_id),
    index('matter_time_entries_user_idx').on(table.user_id),
    index('matter_time_entries_start_time_idx').on(table.start_time),
    index('matter_time_entries_billable_idx').on(table.billable),
  ]
);

// Define relations
export const matterTimeEntriesRelations = relations(matterTimeEntries, ({ one }) => ({
  matter: one(matters, {
    fields: [matterTimeEntries.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterTimeEntries.user_id],
    references: [users.id],
  }),
}));

export type InsertMatterTimeEntry = typeof matterTimeEntries.$inferInsert;
export type SelectMatterTimeEntry = typeof matterTimeEntries.$inferSelect;
