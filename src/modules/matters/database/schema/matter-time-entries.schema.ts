import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { matters } from './matters.schema';

export const matterTimeEntries = pgTable(
  'matter_time_entries',
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
    startTime: timestamp('start_time', { withTimezone: true, mode: 'date' }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true, mode: 'date' }).notNull(),
    duration: integer('duration').notNull(), // in seconds
    description: text('description'),
    billable: boolean('billable').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_time_entries_matter_idx').on(table.matterId),
    index('matter_time_entries_user_idx').on(table.userId),
    index('matter_time_entries_start_time_idx').on(table.startTime),
    index('matter_time_entries_billable_idx').on(table.billable),
  ],
);

// Define relations
export const matterTimeEntriesRelations = relations(matterTimeEntries, ({ one }) => ({
  matter: one(matters, {
    fields: [matterTimeEntries.matterId],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterTimeEntries.userId],
    references: [users.id],
  }),
}));

export type InsertMatterTimeEntry = typeof matterTimeEntries.$inferInsert;
export type SelectMatterTimeEntry = typeof matterTimeEntries.$inferSelect;
