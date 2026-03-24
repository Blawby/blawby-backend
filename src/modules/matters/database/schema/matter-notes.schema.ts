import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import { users } from '@/schema/better-auth-schema';

export const matterNotes = pgTable(
  'matter_notes',
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
    content: text('content').notNull(),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('matter_notes_matter_idx').on(table.matter_id),
    index('matter_notes_user_idx').on(table.user_id),
    index('matter_notes_created_at_idx').on(table.created_at),
  ]
);

// Define relations
export const matterNotesRelations = relations(matterNotes, ({ one }) => ({
  matter: one(matters, {
    fields: [matterNotes.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterNotes.user_id],
    references: [users.id],
  }),
}));

export type InsertMatterNote = typeof matterNotes.$inferInsert;
export type SelectMatterNote = typeof matterNotes.$inferSelect;
