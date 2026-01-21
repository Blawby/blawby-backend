import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { matters } from './matters.schema';

export const matterAssignees = pgTable(
  'matter_assignees',
  {
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.matterId, table.userId] }),
    index('matter_assignees_matter_idx').on(table.matterId),
    index('matter_assignees_user_idx').on(table.userId),
  ],
);

// Define relations
export const matterAssigneesRelations = relations(matterAssignees, ({ one }) => ({
  matter: one(matters, {
    fields: [matterAssignees.matterId],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterAssignees.userId],
    references: [users.id],
  }),
}));

export type InsertMatterAssignee = typeof matterAssignees.$inferInsert;
export type SelectMatterAssignee = typeof matterAssignees.$inferSelect;
