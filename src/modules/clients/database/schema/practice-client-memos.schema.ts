import { relations } from 'drizzle-orm';
import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

import { clients } from '@/modules/clients/database/schema/clients.schema';
import { users } from '@/schema/better-auth-schema';

export const practiceClientMemos = pgTable(
  'practice_client_memos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    client_id: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    created_by: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    content: text('content').notNull(),
    event_time: timestamp('event_time', { withTimezone: true, mode: 'date' }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('practice_client_memos_client_idx').on(table.client_id),
    index('practice_client_memos_created_by_idx').on(table.created_by),
  ]
);

export const practiceClientMemosRelations = relations(practiceClientMemos, ({ one }) => ({
  client: one(clients, {
    fields: [practiceClientMemos.client_id],
    references: [clients.id],
  }),
  creator: one(users, {
    fields: [practiceClientMemos.created_by],
    references: [users.id],
  }),
}));

export const practiceClientMemosSchema = {
  practiceClientMemos,
  practiceClientMemosRelations,
};

export type InsertPracticeClientMemo = typeof practiceClientMemos.$inferInsert;
export type SelectPracticeClientMemo = typeof practiceClientMemos.$inferSelect;
