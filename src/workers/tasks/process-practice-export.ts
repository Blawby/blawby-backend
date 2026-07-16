import { practiceExportJobsRepository } from '@/modules/practice-exports/database/queries/practice-export-jobs.repository';
import { practiceExportGeneratorService } from '@/modules/practice-exports/services/practice-export-generator.service';
import { config } from '@/shared/config';
import { r2Service } from '@/shared/uploads/services/r2.service';
import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';

const logger = getLogger(['workers', 'practice-export']);

interface PracticeExportPayload {
  exportId: string;
  organizationId: string;
}

const isPayload = (value: unknown): value is PracticeExportPayload =>
  typeof value === 'object' &&
  value !== null &&
  'exportId' in value &&
  typeof value.exportId === 'string' &&
  'organizationId' in value &&
  typeof value.organizationId === 'string';

export const processPracticeExport: Task = async (payload): Promise<void> => {
  if (!isPayload(payload)) {
    throw new Error('Invalid practice export payload');
  }
  const { exportId, organizationId } = payload;
  try {
    const existing = await practiceExportJobsRepository.findById(organizationId, exportId);
    if (!existing) {
      throw new Error('Practice export job not found for organization');
    }
    if (existing.status === 'completed') {
      return;
    }
    const job = await practiceExportJobsRepository.markRunning(organizationId, exportId);
    if (!job) {
      throw new Error('Practice export job not found for organization');
    }
    const bucket = config.cloudflare.r2BucketName;
    if (!bucket) {
      throw new Error('R2 export storage is not configured');
    }
    const document = await practiceExportGeneratorService.generate(organizationId, job.type);
    const bytes = new TextEncoder().encode(JSON.stringify(document));
    const storageKey = `orgs/${organizationId}/exports/${exportId}.json`;
    await r2Service.putObject({ bucket, key: storageKey, body: bytes, contentType: 'application/json' });
    await practiceExportJobsRepository.markCompleted(organizationId, exportId, {
      storageKey,
      contentType: 'application/json',
      byteSize: bytes.byteLength,
      manifest: { schema_version: 1, export_type: job.type, organization_id: organizationId },
    });
    logger.info('Practice export completed: {exportId}', { exportId, organizationId, type: job.type });
  } catch (error) {
    await practiceExportJobsRepository.markFailed(
      organizationId,
      exportId,
      'EXPORT_GENERATION_FAILED',
      'Practice export generation failed'
    );
    logger.error('Practice export failed: {exportId}', { exportId, organizationId, error });
    throw error;
  }
};
