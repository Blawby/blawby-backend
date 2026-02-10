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

import { matters } from '@/modules/matters/database/schema/matters.schema';
import { users } from '@/schema';

export const matterStatusHistory = pgTable(
  'matter_status_history',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, {
        onDelete: 'cascade',
      }),
    from_status: varchar('from_status', { length: 40 }),
    to_status: varchar('to_status', { length: 40 }).notNull(),
    changed_by: uuid('changed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    metadata: jsonb('metadata'),
    changed_at: timestamp('changed_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('matter_status_history_matter_idx').on(table.matter_id),
    index('matter_status_history_changed_by_idx').on(table.changed_by),
    index('matter_status_history_changed_at_idx').on(table.changed_at),
    index('matter_status_history_to_status_idx').on(table.to_status),
  ],
);

export const matterStatusHistoryRelations = relations(matterStatusHistory, ({ one }) => ({
  matter: one(matters, {
    fields: [matterStatusHistory.matter_id],
    references: [matters.id],
  }),
  user: one(users, {
    fields: [matterStatusHistory.changed_by],
    references: [users.id],
  }),
}));

export type InsertMatterStatusHistory = typeof matterStatusHistory.$inferInsert;
export type SelectMatterStatusHistory = typeof matterStatusHistory.$inferSelect;
