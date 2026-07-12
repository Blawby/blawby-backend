import { auditLogService } from '@/modules/audit-log/services/audit-log.service';
import type { AuditSourceRecord } from '@/modules/audit-log/types/audit-log.types';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSourceRecords: vi.fn(),
}));

vi.mock('@/modules/audit-log/database/queries/audit-log.queries', () => ({
  auditLogQueries: { listSourceRecords: mocks.listSourceRecords },
}));

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const records = (): [AuditSourceRecord[], AuditSourceRecord[], AuditSourceRecord[]] => [
  [
    {
      source: 'domain_event',
      id: '33333333-3333-4333-8333-333333333333',
      occurredAt: new Date('2026-07-12T12:00:00.000Z'),
      actorId: ACTOR_ID,
      actorType: 'user',
      actorName: 'Practice Owner',
      actorEmail: 'owner@example.test',
      actionType: 'invoice.paid',
      payload: { invoice_id: 'invoice-1' },
      sourceName: 'invoice.webhook',
    },
  ],
  [
    {
      source: 'matter_activity',
      id: '44444444-4444-4444-8444-444444444444',
      occurredAt: new Date('2026-07-12T11:00:00.000Z'),
      actorId: ACTOR_ID,
      actorName: 'Practice Owner',
      actorEmail: 'owner@example.test',
      action: 'note_added',
      matterId: 'matter-1',
      summary: 'Added a matter note',
    },
  ],
  [
    {
      source: 'upload_audit',
      id: '55555555-5555-4555-8555-555555555555',
      occurredAt: new Date('2026-07-12T10:00:00.000Z'),
      actorId: ACTOR_ID,
      actorName: 'Practice Owner',
      actorEmail: 'owner@example.test',
      action: 'downloaded',
      uploadId: 'upload-1',
      fileName: 'engagement-letter.pdf',
    },
  ],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listSourceRecords.mockResolvedValue(records());
});

describe('auditLogService', () => {
  it('composes tenant-scoped sources in stable order with explicit provenance', async () => {
    const ctx = createSystemContext(ORGANIZATION_ID);

    const result = await auditLogService.listAuditLog({ query: { limit: 2 } }, ctx);

    expect(mocks.listSourceRecords).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION_ID, limit: 3 })
    );
    expect(result.data.map((entry) => entry.source.system)).toEqual(['domain_event', 'matter_activity']);
    expect(result.data[0]).toMatchObject({
      action_type: 'invoice.paid',
      target: { type: 'invoice', id: 'invoice-1' },
      source: {
        system: 'domain_event',
        producer: 'invoice.webhook',
        record_id: '33333333-3333-4333-8333-333333333333',
      },
    });
    expect(result.page_info.has_next_page).toBe(true);
    expect(result.page_info.next_cursor).toEqual(expect.any(String));
  });

  it('decodes the stable cursor before querying every source', async () => {
    const ctx = createSystemContext(ORGANIZATION_ID);
    const first = await auditLogService.listAuditLog({ query: { limit: 2 } }, ctx);
    mocks.listSourceRecords.mockResolvedValueOnce([[], [], []]);

    await auditLogService.listAuditLog({ query: { limit: 2, cursor: first.page_info.next_cursor ?? undefined } }, ctx);

    expect(mocks.listSourceRecords).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cursor: {
          occurredAt: new Date('2026-07-12T11:00:00.000Z'),
          source: 'matter_activity',
          id: '44444444-4444-4444-8444-444444444444',
        },
      })
    );
  });

  it('fails fast when an authoritative source record has malformed provenance', async () => {
    const [domain] = records();
    const malformed = domain[0];
    if (!malformed || malformed.source !== 'domain_event') throw new Error('Expected domain event fixture');
    mocks.listSourceRecords.mockResolvedValue([[{ ...malformed, sourceName: null }], [], []]);

    await expect(
      auditLogService.listAuditLog({ query: { limit: 10 } }, createSystemContext(ORGANIZATION_ID))
    ).rejects.toThrow('malformed provenance metadata');
  });

  it('fails fast when a domain event has no stable business target', async () => {
    const [domain] = records();
    const malformed = domain[0];
    if (!malformed || malformed.source !== 'domain_event') {
      throw new Error('Expected domain event fixture');
    }
    mocks.listSourceRecords.mockResolvedValue([[{ ...malformed, payload: { amount: 1000 } }], [], []]);

    await expect(
      auditLogService.listAuditLog({ query: { limit: 10 } }, createSystemContext(ORGANIZATION_ID))
    ).rejects.toThrow('no stable target identifier');
  });

  it('rejects malformed cursors before querying audit sources', async () => {
    await expect(
      auditLogService.listAuditLog(
        { query: { limit: 10, cursor: Buffer.from('{"source":"unknown"}').toString('base64url') } },
        createSystemContext(ORGANIZATION_ID)
      )
    ).rejects.toThrow('Invalid audit-log cursor');

    expect(mocks.listSourceRecords).not.toHaveBeenCalled();
  });

  it('rejects non-admin practice members before reading audit sources', async () => {
    const ctx = createSystemContext(ORGANIZATION_ID);
    ctx.ability = defineAbilityFor('member');

    await expect(auditLogService.listAuditLog({ query: { limit: 10 } }, ctx)).rejects.toThrow();
    expect(mocks.listSourceRecords).not.toHaveBeenCalled();
  });

  it('returns a completed CSV export instead of a pretend enqueue acknowledgement', async () => {
    const csv = await auditLogService.exportAuditLogCsv({ query: {} }, createSystemContext(ORGANIZATION_ID));

    expect(csv).toContain('"occurred_at","action_type"');
    expect(csv).toContain('"invoice.paid"');
    expect(csv).toContain('"matter_activity"');
    expect(csv).toContain('"engagement-letter.pdf"');
  });
});
