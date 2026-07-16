import { practiceExportGeneratorService } from '@/modules/practice-exports/services/practice-export-generator.service';
import { processPracticeExport } from '@/workers/tasks/process-practice-export';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  markRunning: vi.fn(),
  markCompleted: vi.fn(),
  markFailed: vi.fn(),
  generate: vi.fn(),
  putObject: vi.fn(),
}));

vi.mock('@/modules/practice-exports/database/queries/practice-export-jobs.repository', () => ({
  practiceExportJobsRepository: {
    findById: mocks.findById,
    markRunning: mocks.markRunning,
    markCompleted: mocks.markCompleted,
    markFailed: mocks.markFailed,
  },
}));
vi.mock('@/modules/practice-exports/services/practice-export-generator.service', async (importOriginal) => {
  const original = await importOriginal<{
    practiceExportGeneratorService: typeof practiceExportGeneratorService;
  }>();
  return { practiceExportGeneratorService: { ...original.practiceExportGeneratorService, generate: mocks.generate } };
});
vi.mock('@/shared/uploads/services/r2.service', () => ({ r2Service: { putObject: mocks.putObject } }));
vi.mock('@/shared/config', () => ({ config: { cloudflare: { r2BucketName: 'exports-bucket' } } }));

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const EXPORT_ID = '33333333-3333-4333-8333-333333333333';
const exportJob = { id: EXPORT_ID, organization_id: ORG_ID, status: 'queued', type: 'audit_events' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findById.mockResolvedValue(exportJob);
  mocks.markRunning.mockResolvedValue({ ...exportJob, status: 'running' });
  mocks.generate.mockResolvedValue({ organization_id: ORG_ID, audit: [] });
  mocks.putObject.mockResolvedValue(undefined);
});

describe('processPracticeExport', () => {
  it('writes only to the organization-prefixed object key', async () => {
    await processPracticeExport({ exportId: EXPORT_ID, organizationId: ORG_ID }, {});
    expect(mocks.putObject).toHaveBeenCalledWith(
      expect.objectContaining({ key: `orgs/${ORG_ID}/exports/${EXPORT_ID}.json` })
    );
    expect(mocks.markCompleted).toHaveBeenCalledWith(
      ORG_ID,
      EXPORT_ID,
      expect.objectContaining({ manifest: expect.objectContaining({ organization_id: ORG_ID }) })
    );
  });

  it('reports failure and rethrows for Graphile retry', async () => {
    mocks.generate.mockRejectedValue(new Error('malformed source'));
    await expect(processPracticeExport({ exportId: EXPORT_ID, organizationId: ORG_ID }, {})).rejects.toThrow(
      'malformed source'
    );
    expect(mocks.markFailed).toHaveBeenCalledWith(
      ORG_ID,
      EXPORT_ID,
      'EXPORT_GENERATION_FAILED',
      'Practice export generation failed'
    );
  });

  it('fails closed when the job does not belong to the payload organization', async () => {
    mocks.findById.mockResolvedValue(undefined);
    await expect(processPracticeExport({ exportId: EXPORT_ID, organizationId: ORG_ID }, {})).rejects.toThrow(
      'not found for organization'
    );
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});

describe('practice export audit validation', () => {
  it('rejects malformed source provenance', () => {
    expect(() =>
      practiceExportGeneratorService.validateAuditProvenance([{ eventId: EXPORT_ID, metadata: {} }])
    ).toThrow('malformed source provenance');
  });
});
