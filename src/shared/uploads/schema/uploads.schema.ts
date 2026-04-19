import { relations } from 'drizzle-orm';
import { pgTable, uuid, varchar, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';

import { organizations, users } from '@/schema/better-auth-schema';

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').references(() => users.id),
    organization_id: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    file_name: varchar('file_name', { length: 255 }).notNull(),
    file_type: varchar('file_type', { length: 100 }).notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: varchar('mime_type', { length: 100 }).notNull(),

    storage_provider: varchar('storage_provider', { length: 20 }).notNull(),
    storage_key: varchar('storage_key', { length: 500 }).notNull(),
    public_url: varchar('public_url', { length: 1000 }),

    scope_type: varchar('scope_type', { length: 50 }),
    scope_id: uuid('scope_id'),

    status: varchar('status', { length: 20 }).default('pending').notNull(),

    is_privileged: boolean('is_privileged').default(true),
    retention_until: timestamp('retention_until', { withTimezone: true, mode: 'date' }),

    last_accessed_at: timestamp('last_accessed_at', { withTimezone: true, mode: 'date' }),
    last_accessed_by: uuid('last_accessed_by').references(() => users.id),

    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id),
    deletion_reason: varchar('deletion_reason', { length: 255 }),

    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    verified_at: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('uploads_org_scope_idx').on(table.organization_id, table.scope_type, table.scope_id),
    index('uploads_scope_idx').on(table.scope_type, table.scope_id),
    index('uploads_retention_idx').on(table.retention_until),
    index('uploads_status_idx').on(table.status),
    index('uploads_created_at_idx').on(table.created_at),
  ]
);

export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, {
    fields: [uploads.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [uploads.organization_id],
    references: [organizations.id],
  }),
  lastAccessedByUser: one(users, {
    fields: [uploads.last_accessed_by],
    references: [users.id],
    relationName: 'lastAccessedBy',
  }),
  deletedByUser: one(users, {
    fields: [uploads.deleted_by],
    references: [users.id],
    relationName: 'deletedBy',
  }),
}));

export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;
