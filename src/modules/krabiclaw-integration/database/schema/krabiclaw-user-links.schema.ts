import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { users } from '@/schema/better-auth-schema';

export const krabiclawUserLinks = pgTable(
  'krabiclaw_user_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    external_user_id: text('external_user_id').notNull(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('krabiclaw_user_links_external_id_idx').on(table.external_user_id),
    uniqueIndex('krabiclaw_user_links_user_id_idx').on(table.user_id),
  ]
);

export type InsertKrabiClawUserLink = typeof krabiclawUserLinks.$inferInsert;
export type SelectKrabiClawUserLink = typeof krabiclawUserLinks.$inferSelect;
