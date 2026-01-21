import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { matters } from './matters.schema';

export const matterNotes = pgTable(
  'matter_notes',
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
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_notes_matter_idx').on(table.matterId),
    index('matter_notes_user_idx').on(table.userId),
    index('matter_notes_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const matterNotesRelations = relations(matterNotes, ({ one }) => ({
  matter: one(matters, {
    fields: [matterNotes.matterId],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterNotes.userId],
    references: [users.id],
  }),
}));

export type InsertMatterNote = typeof matterNotes.$inferInsert;
export type SelectMatterNote = typeof matterNotes.$inferSelect;
