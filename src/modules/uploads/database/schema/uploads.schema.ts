import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { organizations } from '@/schema';

export const uploads = pgTable(
  'uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    // File metadata
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileType: varchar('file_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),

    // Storage info
    storageProvider: varchar('storage_provider', { length: 20 }).notNull(), // 'r2' | 'images'
    storageKey: varchar('storage_key', { length: 500 }), // R2 key or Images ID
    publicUrl: varchar('public_url', { length: 1000 }),

    // Context & Matter (for legal compliance)
    uploadContext: varchar('upload_context', { length: 50 }).notNull(), // 'matter', 'intake', 'trust', 'profile', 'asset'
    matterId: uuid('matter_id'), // Link to client matter/case
    entityType: varchar('entity_type', { length: 50 }), // 'user', 'organization', 'intake', 'matter'
    entityId: uuid('entity_id'),

    // Status
    status: varchar('status', { length: 20 }).default('pending'), // 'pending', 'verified', 'rejected'

    // Compliance fields (ABA/IOLTA)
    isPrivileged: boolean('is_privileged').default(true), // Attorney-client privilege flag
    retentionUntil: timestamp('retention_until', { withTimezone: true, mode: 'date' }), // When file can be deleted (state bar rules)

    // Audit trail
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true, mode: 'date' }),
    lastAccessedBy: uuid('last_accessed_by').references(() => users.id),

    // Soft delete for compliance (never hard delete without review)
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    deletedBy: uuid('deleted_by').references(() => users.id),
    deletionReason: varchar('deletion_reason', { length: 255 }),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true, mode: 'date' }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }), // For cleanup of unconfirmed uploads
  },
  (table) => [
    index('uploads_org_matter_idx').on(table.organizationId, table.matterId),
    index('uploads_context_idx').on(table.uploadContext),
    index('uploads_retention_idx').on(table.retentionUntil),
    index('uploads_status_idx').on(table.status),
    index('uploads_matter_id_idx').on(table.matterId),
    index('uploads_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const uploadsRelations = relations(uploads, ({ one }) => ({
  user: one(users, {
    fields: [uploads.userId],
    references: [users.id],
  }),
  organization: one(organizations, {
    fields: [uploads.organizationId],
    references: [organizations.id],
  }),
  uploadedByUser: one(users, {
    fields: [uploads.uploadedBy],
    references: [users.id],
    relationName: 'uploadedBy',
  }),
  lastAccessedByUser: one(users, {
    fields: [uploads.lastAccessedBy],
    references: [users.id],
    relationName: 'lastAccessedBy',
  }),
  deletedByUser: one(users, {
    fields: [uploads.deletedBy],
    references: [users.id],
    relationName: 'deletedBy',
  }),
}));

export type InsertUpload = typeof uploads.$inferInsert;
export type SelectUpload = typeof uploads.$inferSelect;
