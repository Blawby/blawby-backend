import { relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';

import { users } from '@/schema';
import { organizations } from '@/schema';
import { uploads } from './uploads.schema';

export const uploadAuditLogs = pgTable(
  'upload_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uploadId: uuid('upload_id')
      .notNull()
      .references(() => uploads.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),

    // Action details
    action: varchar('action', { length: 50 }).notNull(), // 'created', 'viewed', 'downloaded', 'deleted', 'restored'

    // Actor info
    userId: uuid('user_id').references(() => users.id),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),

    // Additional context
    metadata: jsonb('metadata'), // Any additional action-specific data

    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('audit_logs_upload_idx').on(table.uploadId),
    index('audit_logs_org_idx').on(table.organizationId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_user_idx').on(table.userId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
);

// Define relations
export const uploadAuditLogsRelations = relations(uploadAuditLogs, ({ one }) => ({
  upload: one(uploads, {
    fields: [uploadAuditLogs.uploadId],
    references: [uploads.id],
  }),
  organization: one(organizations, {
    fields: [uploadAuditLogs.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [uploadAuditLogs.userId],
    references: [users.id],
  }),
}));

export type InsertUploadAuditLog = typeof uploadAuditLogs.$inferInsert;
export type SelectUploadAuditLog = typeof uploadAuditLogs.$inferSelect;
