import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

import { matters } from '@/modules/matters/database/schema/matters.schema';
import { users } from '@/schema';
import { organizations } from '@/schema';

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').references(() => users.id),
    organization_id: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    // File metadata
    file_name: varchar('file_name', { length: 255 }).notNull(),
    file_type: varchar('file_type', { length: 100 }).notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: varchar('mime_type', { length: 100 }).notNull(),

    // Storage info
    storage_provider: varchar('storage_provider', { length: 20 }).notNull(), // 'r2' | 'images'
    storage_key: varchar('storage_key', { length: 500 }), // R2 key or Images ID
    public_url: varchar('public_url', { length: 1000 }),

    // Context & Matter (for legal compliance)
    upload_context: varchar('upload_context', { length: 50 }).notNull(), // 'matter', 'intake', 'trust', 'profile', 'asset'
    matter_id: uuid('matter_id').references(() => matters.id, {
      onDelete: 'set null',
    }), // Link to client matter/case
    entity_type: varchar('entity_type', { length: 50 }), // 'user', 'organization', 'intake', 'matter'
    entity_id: uuid('entity_id'),

    // Status
    status: varchar('status', { length: 20 }).default('pending'), // 'pending', 'verified', 'rejected'

    // Compliance fields (ABA/IOLTA)
    is_privileged: boolean('is_privileged').default(true), // Attorney-client privilege flag
    retention_until: timestamp('retention_until', { withTimezone: true, mode: 'date' }), // When file can be deleted (state bar rules)

    // Audit trail
    uploaded_by: uuid('uploaded_by').references(() => users.id),
    last_accessed_at: timestamp('last_accessed_at', { withTimezone: true, mode: 'date' }),
    last_accessed_by: uuid('last_accessed_by').references(() => users.id),

    // Soft delete for compliance (never hard delete without review)
    deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deleted_by: uuid('deleted_by').references(() => users.id),
    deletion_reason: varchar('deletion_reason', { length: 255 }),

    // Timestamps
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    verified_at: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    expires_at: timestamp('expires_at', { withTimezone: true, mode: 'date' }), // For cleanup of unconfirmed uploads
  },
  (table) => [
    index('uploads_org_matter_idx').on(table.organization_id, table.matter_id),
    index('uploads_context_idx').on(table.upload_context),
    index('uploads_retention_idx').on(table.retention_until),
    index('uploads_status_idx').on(table.status),
    index('uploads_matter_id_idx').on(table.matter_id),
    index('uploads_created_at_idx').on(table.created_at),
  ],
);

// Define relations
export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, {
    fields: [uploads.user_id],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [uploads.organization_id],
    references: [organizations.id],
  }),
  matter: one(matters, {
    fields: [uploads.matter_id],
    references: [matters.id],
  }),
  uploadedByUser: one(users, {
    fields: [uploads.uploaded_by],
    references: [users.id],
    relationName: 'uploadedBy',
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
