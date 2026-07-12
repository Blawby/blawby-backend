import { z } from '@hono/zod-openapi';

const auditSourceSchema = z.enum(['domain_event', 'matter_activity', 'upload_audit']);
type AuditSource = z.infer<typeof auditSourceSchema>;

const auditActorTypeSchema = z.enum(['user', 'system', 'webhook', 'cron', 'api', 'organization']);

const auditLogEntrySchema = z.object({
  id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
  actor: z.object({
    id: z.uuid().nullable(),
    type: auditActorTypeSchema,
    name: z.string().nullable(),
    email: z.email().nullable(),
  }),
  action_type: z.string().min(1),
  target: z.object({
    type: z.string().min(1),
    id: z.string().min(1),
  }),
  summary: z.string().min(1),
  source: z.object({
    system: auditSourceSchema,
    producer: z.string().min(1),
    record_id: z.uuid(),
  }),
});

type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

const listAuditLogQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().min(1).max(200).optional(),
    type: z.string().trim().min(1).max(100).optional(),
    actor: z.uuid().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '`from` must be before or equal to `to`',
    path: ['from'],
  });

type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

const auditLogResponseSchema = z.object({
  data: z.array(auditLogEntrySchema),
  page_info: z.object({
    has_next_page: z.boolean(),
    has_previous_page: z.boolean(),
    next_cursor: z.string().nullable(),
    previous_cursor: z.null(),
  }),
});

interface AuditCursorBoundary {
  occurredAt: Date;
  source: AuditSource;
  id: string;
}

interface AuditSourceRecordBase {
  id: string;
  occurredAt: Date;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
}

interface DomainEventAuditRecord extends AuditSourceRecordBase {
  source: 'domain_event';
  actorType: 'user' | 'system' | 'webhook' | 'cron' | 'api' | 'organization';
  actionType: string;
  payload: Record<string, unknown>;
  sourceName: string | null;
}

interface MatterActivityAuditRecord extends AuditSourceRecordBase {
  source: 'matter_activity';
  action: string;
  matterId: string;
  summary: string;
}

interface UploadAuditRecord extends AuditSourceRecordBase {
  source: 'upload_audit';
  action: string;
  uploadId: string;
  fileName: string;
}

type AuditSourceRecord = DomainEventAuditRecord | MatterActivityAuditRecord | UploadAuditRecord;

interface AuditSourceFilters {
  organizationId: string;
  cursor?: AuditCursorBoundary;
  limit: number;
  search?: string;
  type?: string;
  actor?: string;
  from?: Date;
  to?: Date;
}

export {
  auditActorTypeSchema,
  auditLogEntrySchema,
  auditLogResponseSchema,
  auditSourceSchema,
  listAuditLogQuerySchema,
};
export type {
  AuditCursorBoundary,
  AuditLogEntry,
  AuditSource,
  AuditSourceFilters,
  AuditSourceRecord,
  DomainEventAuditRecord,
  ListAuditLogQuery,
  MatterActivityAuditRecord,
  UploadAuditRecord,
};
