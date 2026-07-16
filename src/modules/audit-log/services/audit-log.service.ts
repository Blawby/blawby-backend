import { auditLogQueries } from '@/modules/audit-log/database/queries/audit-log.queries';
import {
  auditSourceSchema,
  type AuditCursorBoundary,
  type AuditLogEntry,
  type AuditSourceRecord,
  type ListAuditLogQuery,
} from '@/modules/audit-log/types/audit-log.types';
import type { CursorPaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const EXPORT_MAX_ROWS = 50_000;
const EXPORT_PAGE_SIZE = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodeCursor = (cursor: string | undefined): AuditCursorBoundary | undefined => {
  if (!cursor) {
    return undefined;
  }
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!isRecord(decoded)) {
      throw new Error('Cursor payload is not an object');
    }
    const occurredAt = typeof decoded.occurred_at === 'string' ? new Date(decoded.occurred_at) : null;
    const source = auditSourceSchema.safeParse(decoded.source);
    if (!occurredAt || Number.isNaN(occurredAt.getTime()) || !source.success || typeof decoded.id !== 'string') {
      throw new Error('Cursor payload is malformed');
    }
    return { occurredAt, source: source.data, id: decoded.id };
  } catch (error) {
    throw new HTTPException(400, { message: 'Invalid audit-log cursor', cause: error });
  }
};

const encodeCursor = (entry: AuditLogEntry): string =>
  Buffer.from(
    JSON.stringify({ occurred_at: entry.occurred_at, source: entry.source.system, id: entry.id }),
    'utf8'
  ).toString('base64url');

const targetKeys = [
  'invoice_id',
  'refund_request_id',
  'matter_id',
  'upload_id',
  'client_id',
  'intake_id',
  'invitation_id',
  'invitationId',
  'user_id',
  'userId',
  'practice_details_id',
  'user_detail_id',
  'intake_payment_id',
  'stripe_payment_intent_id',
  'event_id',
  'organization_id',
  'organizationId',
] as const;

const targetFromPayload = (payload: Record<string, unknown>, actionType: string): { type: string; id: string } => {
  for (const key of targetKeys) {
    const value = payload[key];
    if (typeof value === 'string' && value.length > 0) {
      const type = key.replace(/Id$/, '').replace(/_id$/, '').replaceAll('_', '-');
      return { type, id: value };
    }
  }
  throw new Error(`Audit source event '${actionType}' has no stable target identifier`);
};

const humanizeAction = (actionType: string): string => {
  const words = actionType.replaceAll(':', '.').replaceAll('_', ' ').split('.').filter(Boolean).join(' ');
  const firstCharacter = words.at(0);
  return words.length === 0 || !firstCharacter ? actionType : firstCharacter.toUpperCase() + words.slice(1);
};

const mapSourceRecord = (record: AuditSourceRecord): AuditLogEntry => {
  if (record.source === 'domain_event') {
    if (!record.sourceName) {
      throw new Error(`Audit source event '${record.id}' has malformed provenance metadata`);
    }
    const target = targetFromPayload(record.payload, record.actionType);
    return {
      id: record.id,
      occurred_at: record.occurredAt.toISOString(),
      actor: {
        id: record.actorType === 'user' ? record.actorId : null,
        type: record.actorType,
        name: record.actorName,
        email: record.actorEmail,
      },
      action_type: record.actionType,
      target,
      summary: `${humanizeAction(record.actionType)} · ${target.type} ${target.id}`,
      source: { system: 'domain_event', producer: record.sourceName, record_id: record.id },
    };
  }

  if (record.source === 'matter_activity') {
    return {
      id: record.id,
      occurred_at: record.occurredAt.toISOString(),
      actor: {
        id: record.actorId,
        type: record.actorId ? 'user' : 'system',
        name: record.actorName,
        email: record.actorEmail,
      },
      action_type: `matter.activity.${record.action}`,
      target: { type: 'matter', id: record.matterId },
      summary: record.summary,
      source: { system: 'matter_activity', producer: 'matter_activity_log', record_id: record.id },
    };
  }

  return {
    id: record.id,
    occurred_at: record.occurredAt.toISOString(),
    actor: {
      id: record.actorId,
      type: record.actorId ? 'user' : 'system',
      name: record.actorName,
      email: record.actorEmail,
    },
    action_type: `upload.${record.action}`,
    target: { type: 'upload', id: record.uploadId },
    summary: `File "${record.fileName}" was ${record.action.replaceAll('_', ' ')}`,
    source: { system: 'upload_audit', producer: 'upload_audit_logs', record_id: record.id },
  };
};

const compareEntries = (left: AuditLogEntry, right: AuditLogEntry): number => {
  const timeComparison = right.occurred_at.localeCompare(left.occurred_at);
  if (timeComparison !== 0) {
    return timeComparison;
  }
  const sourceComparison = left.source.system.localeCompare(right.source.system);
  if (sourceComparison !== 0) {
    return sourceComparison;
  }
  return right.id.localeCompare(left.id);
};

const listAuditLog = async (
  { query }: { query: ListAuditLogQuery },
  ctx: ServiceContext
): Promise<CursorPaginatedResponse<AuditLogEntry>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'AuditLog');

  const cursor = decodeCursor(query.cursor);
  const sourceRows = await auditLogQueries.listSourceRecords({
    organizationId: ctx.organizationId,
    cursor,
    limit: query.limit + 1,
    search: query.search,
    type: query.type,
    actor: query.actor,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
  });
  const sorted = sourceRows.flat().map(mapSourceRecord).sort(compareEntries);
  const hasNextPage = sorted.length > query.limit;
  const data = sorted.slice(0, query.limit);
  const last = data.at(-1);

  return {
    data,
    page_info: {
      has_next_page: hasNextPage,
      has_previous_page: cursor !== undefined,
      next_cursor: hasNextPage && last ? encodeCursor(last) : null,
      previous_cursor: null,
    },
  };
};

const escapeCsv = (value: string): string => `"${value.replaceAll('"', '""')}"`;

const exportAuditLogCsv = async (
  { query }: { query: Omit<ListAuditLogQuery, 'cursor' | 'limit'> },
  ctx: ServiceContext
): Promise<string> => {
  const entries: AuditLogEntry[] = [];
  let cursor: string | undefined = undefined;

  do {
    // oxlint-disable-next-line no-await-in-loop -- each page depends on the prior page's stable cursor.
    const page = await listAuditLog({ query: { ...query, cursor, limit: EXPORT_PAGE_SIZE } }, ctx);
    entries.push(...page.data);
    if (entries.length > EXPORT_MAX_ROWS) {
      throw new HTTPException(413, { message: 'Audit export exceeds the synchronous export limit' });
    }
    cursor = page.page_info.next_cursor ?? undefined;
  } while (cursor);

  const header = [
    'occurred_at',
    'action_type',
    'actor_type',
    'actor_name',
    'actor_email',
    'target_type',
    'target_id',
    'summary',
    'source',
    'source_producer',
    'record_id',
  ];
  const rows = entries.map((entry) =>
    [
      entry.occurred_at,
      entry.action_type,
      entry.actor.type,
      entry.actor.name ?? '',
      entry.actor.email ?? '',
      entry.target.type,
      entry.target.id,
      entry.summary,
      entry.source.system,
      entry.source.producer,
      entry.source.record_id,
    ]
      .map(escapeCsv)
      .join(',')
  );
  return [header.map(escapeCsv).join(','), ...rows].join('\n');
};

export const auditLogService = {
  listAuditLog,
  exportAuditLogCsv,
};
