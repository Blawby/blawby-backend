import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

import { matters } from './matters.schema';
import { users } from '@/schema';

export const matterAssignees = pgTable(
  'matter_assignees',
  {
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
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matter_id, table.user_id] }),
    index('matter_assignees_matter_idx').on(table.matter_id),
    index('matter_assignees_user_idx').on(table.user_id),
  ],
);

// Define relations
export const matterAssigneesRelations = relations(matterAssignees, ({ one }) => ({
  matter: one(matters, {
    fields: [matterAssignees.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterAssignees.user_id],
    references: [users.id],
  }),
}));

export type InsertMatterAssignee = typeof matterAssignees.$inferInsert;
export type SelectMatterAssignee = typeof matterAssignees.$inferSelect;
