import { relations } from 'drizzle-orm';
import { index, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { matters } from '@/modules/matters/database/schema/matters.schema';
import { uploads } from '@/shared/uploads/schema/uploads.schema';
import { users } from '@/schema/better-auth-schema';

export const matterFiles = pgTable(
  'matter_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    matter_id: uuid('matter_id')
      .notNull()
      .references(() => matters.id, { onDelete: 'cascade' }),
    upload_id: uuid('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    linked_by: uuid('linked_by')
      .notNull()
      .references(() => users.id),
    linked_at: timestamp('linked_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('matter_files_matter_upload_unique').on(table.matter_id, table.upload_id),
    index('matter_files_matter_idx').on(table.matter_id),
    index('matter_files_upload_idx').on(table.upload_id),
  ]
);

export const matterFilesRelations = relations(matterFiles, ({ one }) => ({
  matter: one(matters, {
    fields: [matterFiles.matter_id],
    references: [matters.id],
  }),
  upload: one(uploads, {
    fields: [matterFiles.upload_id],
    references: [uploads.id],
  }),
  linkedBy: one(users, {
    fields: [matterFiles.linked_by],
    references: [users.id],
  }),
}));

export type InsertMatterFile = typeof matterFiles.$inferInsert;
export type SelectMatterFile = typeof matterFiles.$inferSelect;
