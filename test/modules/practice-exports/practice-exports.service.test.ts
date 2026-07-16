import { practiceExportsService } from '@/modules/practice-exports/services/practice-exports.service';
import { defineAbilityFor } from '@/shared/auth/abilities';
import { createSystemContext } from '@/shared/types/service-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findById: vi.fn(),
  markFailed: vi.fn(),
  addJob: vi.fn(),
  signedUrl: vi.fn(),
}));

vi.mock('@/modules/practice-exports/database/queries/practice-export-jobs.repository', () => ({
  practiceExportJobsRepository: {
    create: mocks.create,
    findById: mocks.findById,
    markFailed: mocks.markFailed,
  },
}));
vi.mock('@/shared/queue/queue.manager', () => ({ addPracticeExportJob: mocks.addJob }));
vi.mock('@/shared/uploads/services/r2.service', () => ({
  r2Service: { generatePresignedDownloadUrl: mocks.signedUrl },
}));
vi.mock('@/shared/config', () => ({ config: { cloudflare: { r2BucketName: 'exports-bucket' } } }));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const EXPORT_ID = '33333333-3333-4333-8333-333333333333';
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444';

const job = (status: 'queued' | 'running' | 'completed' | 'failed' = 'queued') => ({
  id: EXPORT_ID,
  organization_id: ORG_ID,
  requested_by: USER_ID,
  idempotency_key: IDEMPOTENCY_KEY,
  type: 'full_practice_archive' as const,
  status,
  storage_key: status === 'completed' ? `orgs/${ORG_ID}/exports/${EXPORT_ID}.json` : null,
  content_type: status === 'completed' ? 'application/json' : null,
  byte_size: status === 'completed' ? 100 : null,
  manifest: status === 'completed' ? { organization_id: ORG_ID } : null,
  error_code: status === 'failed' ? 'FAILED' : null,
  error_message: status === 'failed' ? 'Export failed' : null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  started_at: status === 'queued' ? null : new Date('2026-01-01T00:01:00.000Z'),
  completed_at: status === 'completed' ? new Date('2026-01-01T00:02:00.000Z') : null,
  failed_at: status === 'failed' ? new Date('2026-01-01T00:02:00.000Z') : null,
});

const ctx = () => createSystemContext(ORG_ID, USER_ID);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ job: job(), created: true });
  mocks.addJob.mockResolvedValue(undefined);
  mocks.signedUrl.mockResolvedValue('https://download.example.test/signed');
});

describe('practiceExportsService', () => {
  it('queues a durable tenant-scoped export only after its row exists', async () => {
    const result = await practiceExportsService.requestExport(
      { data: { type: 'full_practice_archive', idempotency_key: IDEMPOTENCY_KEY } },
      ctx()
    );

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ organization_id: ORG_ID }));
    expect(mocks.addJob).toHaveBeenCalledWith({ exportId: EXPORT_ID, organizationId: ORG_ID });
    expect(result.status).toBe('queued');
  });

  it('returns an idempotent replay without adding another queue job', async () => {
    mocks.create.mockResolvedValue({ job: job(), created: false });
    const result = await practiceExportsService.requestExport(
      { data: { type: 'full_practice_archive', idempotency_key: IDEMPOTENCY_KEY } },
      ctx()
    );
    expect(result.id).toBe(EXPORT_ID);
    expect(mocks.addJob).not.toHaveBeenCalled();
  });

  it('persists queue failure and does not return false success', async () => {
    mocks.addJob.mockRejectedValue(new Error('queue unavailable'));
    await expect(
      practiceExportsService.requestExport(
        { data: { type: 'full_practice_archive', idempotency_key: IDEMPOTENCY_KEY } },
        ctx()
      )
    ).rejects.toThrow('Failed to queue practice export');
    expect(mocks.markFailed).toHaveBeenCalledWith(
      ORG_ID,
      EXPORT_ID,
      'QUEUE_UNAVAILABLE',
      'Export could not be queued for processing'
    );
  });

  it('enforces permission before creating an export', async () => {
    const memberContext = ctx();
    memberContext.ability = defineAbilityFor('member');
    await expect(
      practiceExportsService.requestExport(
        { data: { type: 'audit_events', idempotency_key: IDEMPOTENCY_KEY } },
        memberContext
      )
    ).rejects.toThrow();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not reveal another tenant export', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(practiceExportsService.getExport({ id: EXPORT_ID }, ctx())).rejects.toMatchObject({ status: 404 });
  });

  it('generates a five-minute URL only after completion', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00.000Z'));
    mocks.findById.mockResolvedValue(job('completed'));
    const result = await practiceExportsService.getExport({ id: EXPORT_ID }, ctx());
    expect(result.download).toEqual({
      url: 'https://download.example.test/signed',
      expires_at: '2026-01-01T12:05:00.000Z',
    });
    expect(mocks.signedUrl).toHaveBeenCalledWith(
      expect.objectContaining({ key: `orgs/${ORG_ID}/exports/${EXPORT_ID}.json`, expiresIn: 300 })
    );
    vi.useRealTimers();
  });
});
