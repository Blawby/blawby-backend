import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';

import { matters } from './matters.schema';
import { users } from '@/schema';

export const matterActivityLog = pgTable(
  'matter_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    user_id: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 50 }).notNull(), // 'created', 'updated', 'note_added', 'time_entry_added', etc.
    description: text('description').notNull(), // Human-readable description
    metadata: jsonb('metadata'), // Additional context
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matter_activity_log_matter_idx').on(table.matter_id),
    index('matter_activity_log_user_idx').on(table.user_id),
    index('matter_activity_log_action_idx').on(table.action),
    index('matter_activity_log_created_at_idx').on(table.created_at),
  ]
);

// Define relations
export const matterActivityLogRelations = relations(matterActivityLog, ({ one }) => ({
  matter: one(matters, {
    fields: [matterActivityLog.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterActivityLog.user_id],
    references: [users.id],
  }),
}));

export type InsertMatterActivityLog = typeof matterActivityLog.$inferInsert;
export type SelectMatterActivityLog = typeof matterActivityLog.$inferSelect;
