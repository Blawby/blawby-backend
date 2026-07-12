import { matterActivityLog } from '@/modules/matters/database/schema/matter-activity-log.schema';
import { matters } from '@/modules/matters/database/schema/matters.schema';
import type {
  AuditCursorBoundary,
  AuditSource,
  AuditSourceFilters,
  DomainEventAuditRecord,
  MatterActivityAuditRecord,
  UploadAuditRecord,
} from '@/modules/audit-log/types/audit-log.types';
import { users } from '@/schema/better-auth-schema';
import { getActiveTx } from '@/shared/database/uow';
import { eventsDeadLetter } from '@/shared/events/schemas/events-dead-letter.schema';
import { events } from '@/shared/events/schemas/events.schema';
import { uploadAuditLogs } from '@/shared/uploads/schema/upload-audit-logs.schema';
import { uploads } from '@/shared/uploads/schema/uploads.schema';
import { and, desc, eq, gte, ilike, lte, lt, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';

const cursorCondition = (
  source: AuditSource,
  occurredAtColumn: AnyColumn<{ data: Date }>,
  idColumn: AnyColumn<{ data: string }>,
  cursor?: AuditCursorBoundary
): SQL | undefined => {
  if (!cursor) {
    return undefined;
  }

  const earlier = lt(occurredAtColumn, cursor.occurredAt);
  if (source > cursor.source) {
    return or(earlier, eq(occurredAtColumn, cursor.occurredAt));
  }
  if (source < cursor.source) {
    return earlier;
  }
  return or(earlier, and(eq(occurredAtColumn, cursor.occurredAt), lt(idColumn, cursor.id)));
};

const sharedConditions = (
  filters: AuditSourceFilters,
  occurredAtColumn: AnyColumn<{ data: Date }>,
  actorIdColumn: AnyColumn<{ data: string }>,
  source: AuditSource,
  idColumn: AnyColumn<{ data: string }>
): SQL[] => {
  const conditions: SQL[] = [];
  const cursor = cursorCondition(source, occurredAtColumn, idColumn, filters.cursor);
  if (cursor) {
    conditions.push(cursor);
  }
  if (filters.actor) {
    conditions.push(eq(actorIdColumn, filters.actor));
  }
  if (filters.from) {
    conditions.push(gte(occurredAtColumn, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(occurredAtColumn, filters.to));
  }
  return conditions;
};

const sourceNameFromMetadata = (metadata: unknown): string | null => {
  if (typeof metadata === 'object' && metadata !== null && 'source' in metadata) {
    return typeof metadata.source === 'string' ? metadata.source : null;
  }
  return null;
};

const listActiveDomainEvents = async (filters: AuditSourceFilters): Promise<DomainEventAuditRecord[]> => {
  const conditions = [
    eq(events.organizationId, filters.organizationId),
    ...sharedConditions(filters, events.createdAt, events.actorId, 'domain_event', events.eventId),
  ];
  if (filters.type) {
    conditions.push(eq(events.type, filters.type));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const search = or(
      ilike(events.type, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      sql`${events.payload}::text ILIKE ${pattern}`
    );
    if (search) {
      conditions.push(search);
    }
  }

  const rows = await getActiveTx()
    .select({
      id: events.eventId,
      occurredAt: events.createdAt,
      actorId: events.actorId,
      actorType: events.actorType,
      actorName: users.name,
      actorEmail: users.email,
      actionType: events.type,
      payload: events.payload,
      sourceName: events.metadata,
    })
    .from(events)
    .leftJoin(users, eq(events.actorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(events.createdAt), desc(events.eventId))
    .limit(filters.limit);

  return rows.map((row) => ({
    ...row,
    source: 'domain_event',
    sourceName: sourceNameFromMetadata(row.sourceName),
  }));
};

const listDeadLetterDomainEvents = async (filters: AuditSourceFilters): Promise<DomainEventAuditRecord[]> => {
  const conditions = [
    eq(eventsDeadLetter.organizationId, filters.organizationId),
    ...sharedConditions(
      filters,
      eventsDeadLetter.originalCreatedAt,
      eventsDeadLetter.actorId,
      'domain_event',
      eventsDeadLetter.eventId
    ),
  ];
  if (filters.type) {
    conditions.push(eq(eventsDeadLetter.type, filters.type));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const search = or(
      ilike(eventsDeadLetter.type, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern),
      sql`${eventsDeadLetter.payload}::text ILIKE ${pattern}`
    );
    if (search) {
      conditions.push(search);
    }
  }

  const rows = await getActiveTx()
    .select({
      id: eventsDeadLetter.eventId,
      occurredAt: eventsDeadLetter.originalCreatedAt,
      actorId: eventsDeadLetter.actorId,
      actorType: eventsDeadLetter.actorType,
      actorName: users.name,
      actorEmail: users.email,
      actionType: eventsDeadLetter.type,
      payload: eventsDeadLetter.payload,
      sourceName: eventsDeadLetter.metadata,
    })
    .from(eventsDeadLetter)
    .leftJoin(users, eq(eventsDeadLetter.actorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(eventsDeadLetter.originalCreatedAt), desc(eventsDeadLetter.eventId))
    .limit(filters.limit);

  return rows.map((row) => ({
    ...row,
    source: 'domain_event',
    sourceName: sourceNameFromMetadata(row.sourceName),
  }));
};

const listDomainEvents = async (filters: AuditSourceFilters): Promise<DomainEventAuditRecord[]> => {
  const [active, deadLetter] = await Promise.all([
    listActiveDomainEvents(filters),
    listDeadLetterDomainEvents(filters),
  ]);
  return [...active, ...deadLetter]
    .sort((left, right) => {
      const timeComparison = right.occurredAt.getTime() - left.occurredAt.getTime();
      return timeComparison === 0 ? right.id.localeCompare(left.id) : timeComparison;
    })
    .slice(0, filters.limit);
};

const listMatterActivity = async (filters: AuditSourceFilters): Promise<MatterActivityAuditRecord[]> => {
  if (filters.type && !filters.type.startsWith('matter.activity.')) {
    return [];
  }

  const conditions = [
    eq(matters.organization_id, filters.organizationId),
    ...sharedConditions(
      filters,
      matterActivityLog.created_at,
      matterActivityLog.user_id,
      'matter_activity',
      matterActivityLog.id
    ),
  ];
  if (filters.type) {
    conditions.push(eq(matterActivityLog.action, filters.type.slice('matter.activity.'.length)));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const search = or(
      ilike(matterActivityLog.action, pattern),
      ilike(matterActivityLog.description, pattern),
      ilike(matters.title, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    );
    if (search) {
      conditions.push(search);
    }
  }

  const rows = await getActiveTx()
    .select({
      id: matterActivityLog.id,
      occurredAt: matterActivityLog.created_at,
      actorId: matterActivityLog.user_id,
      actorName: users.name,
      actorEmail: users.email,
      action: matterActivityLog.action,
      matterId: matterActivityLog.matter_id,
      summary: matterActivityLog.description,
    })
    .from(matterActivityLog)
    .innerJoin(matters, eq(matterActivityLog.matter_id, matters.id))
    .leftJoin(users, eq(matterActivityLog.user_id, users.id))
    .where(and(...conditions))
    .orderBy(desc(matterActivityLog.created_at), desc(matterActivityLog.id))
    .limit(filters.limit);

  return rows.map((row) => ({ ...row, source: 'matter_activity' }));
};

const listUploadAudit = async (filters: AuditSourceFilters): Promise<UploadAuditRecord[]> => {
  if (filters.type && !filters.type.startsWith('upload.')) {
    return [];
  }

  const conditions = [
    eq(uploadAuditLogs.organization_id, filters.organizationId),
    ...sharedConditions(
      filters,
      uploadAuditLogs.created_at,
      uploadAuditLogs.user_id,
      'upload_audit',
      uploadAuditLogs.id
    ),
  ];
  if (filters.type) {
    conditions.push(eq(uploadAuditLogs.action, filters.type.slice('upload.'.length)));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    const search = or(
      ilike(uploadAuditLogs.action, pattern),
      ilike(uploads.file_name, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    );
    if (search) {
      conditions.push(search);
    }
  }

  const rows = await getActiveTx()
    .select({
      id: uploadAuditLogs.id,
      occurredAt: uploadAuditLogs.created_at,
      actorId: uploadAuditLogs.user_id,
      actorName: users.name,
      actorEmail: users.email,
      action: uploadAuditLogs.action,
      uploadId: uploadAuditLogs.upload_id,
      fileName: uploads.file_name,
    })
    .from(uploadAuditLogs)
    .innerJoin(uploads, eq(uploadAuditLogs.upload_id, uploads.id))
    .leftJoin(users, eq(uploadAuditLogs.user_id, users.id))
    .where(and(...conditions))
    .orderBy(desc(uploadAuditLogs.created_at), desc(uploadAuditLogs.id))
    .limit(filters.limit);

  return rows.map((row) => ({ ...row, source: 'upload_audit' }));
};

const listSourceRecords = async (filters: AuditSourceFilters) =>
  Promise.all([listDomainEvents(filters), listMatterActivity(filters), listUploadAudit(filters)]);

export const auditLogQueries = {
  listSourceRecords,
};
