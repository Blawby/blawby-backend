import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { matters } from './matters.schema';

export const matterActivityLog = pgTable(
  'matter_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matterId: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: varchar('action', { length: 50 }).notNull(), // 'created', 'updated', 'note_added', 'time_entry_added', etc.
    description: text('description').notNull(), // Human-readable description
    metadata: jsonb('metadata'), // Additional context
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_activity_log_matter_idx').on(table.matterId),
    index('matter_activity_log_user_idx').on(table.userId),
    index('matter_activity_log_action_idx').on(table.action),
    index('matter_activity_log_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const matterActivityLogRelations = relations(matterActivityLog, ({ one }) => ({
  matter: one(matters, {
    fields: [matterActivityLog.matterId],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterActivityLog.userId],
    references: [users.id],
  }),
}));

export type InsertMatterActivityLog = typeof matterActivityLog.$inferInsert;
export type SelectMatterActivityLog = typeof matterActivityLog.$inferSelect;
