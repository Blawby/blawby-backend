import { organizations, users } from '@/schema/better-auth-schema';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export type PracticeExportType =
  | 'full_practice_archive'
  | 'matters_contacts'
  | 'billing_invoices'
  | 'trust_ledger'
  | 'audit_events';
export type PracticeExportStatus = 'queued' | 'running' | 'completed' | 'failed';

export const practiceExportJobs = pgTable(
  'practice_export_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requested_by: uuid('requested_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    idempotency_key: uuid('idempotency_key').notNull(),
    type: text('type').notNull().$type<PracticeExportType>(),
    status: text('status').notNull().default('queued').$type<PracticeExportStatus>(),
    storage_key: text('storage_key'),
    content_type: text('content_type'),
    byte_size: integer('byte_size'),
    manifest: jsonb('manifest').$type<Record<string, unknown>>(),
    error_code: text('error_code'),
    error_message: text('error_message'),
    created_at: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    started_at: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completed_at: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    failed_at: timestamp('failed_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    uniqueIndex('practice_export_jobs_org_idempotency_idx').on(table.organization_id, table.idempotency_key),
    index('practice_export_jobs_org_created_idx').on(table.organization_id, table.created_at),
    index('practice_export_jobs_status_idx').on(table.status, table.created_at),
  ]
);

export type PracticeExportJob = typeof practiceExportJobs.$inferSelect;
export type InsertPracticeExportJob = typeof practiceExportJobs.$inferInsert;
