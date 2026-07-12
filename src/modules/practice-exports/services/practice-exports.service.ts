import { practiceExportJobsRepository } from '@/modules/practice-exports/database/queries/practice-export-jobs.repository';
import type { PracticeExportJob } from '@/modules/practice-exports/database/schema/practice-export-jobs.schema';
import type {
  CreatePracticeExportRequest,
  PracticeExportJobResponse,
} from '@/modules/practice-exports/types/practice-exports.types';
import { config } from '@/shared/config';
import { addPracticeExportJob } from '@/shared/queue/queue.manager';
import type { ServiceContext } from '@/shared/types/service-context';
import { r2Service } from '@/shared/uploads/services/r2.service';
import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';

const DOWNLOAD_TTL_SECONDS = 5 * 60;

const toResponse = async (job: PracticeExportJob): Promise<PracticeExportJobResponse> => {
  let download: PracticeExportJobResponse['download'] = null;
  if (job.status === 'completed') {
    const bucket = config.cloudflare.r2BucketName;
    if (!bucket || !job.storage_key) {
      throw new Error('Completed export is missing durable storage configuration');
    }
    const url = await r2Service.generatePresignedDownloadUrl({
      bucket,
      key: job.storage_key,
      expiresIn: DOWNLOAD_TTL_SECONDS,
    });
    if (!url) {
      throw new Error('Unable to create export download URL');
    }
    download = {
      url,
      expires_at: new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString(),
    };
  }

  return {
    id: job.id,
    organization_id: job.organization_id,
    requested_by: job.requested_by,
    idempotency_key: job.idempotency_key,
    type: job.type,
    status: job.status,
    content_type: job.content_type,
    byte_size: job.byte_size,
    manifest: job.manifest,
    error: job.error_code && job.error_message ? { code: job.error_code, message: job.error_message } : null,
    created_at: job.created_at.toISOString(),
    started_at: job.started_at?.toISOString() ?? null,
    completed_at: job.completed_at?.toISOString() ?? null,
    failed_at: job.failed_at?.toISOString() ?? null,
    download,
  };
};

const requestExport = async (
  { data }: { data: CreatePracticeExportRequest },
  ctx: ServiceContext
): Promise<PracticeExportJobResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'DataExport');
  const { job, created } = await practiceExportJobsRepository.create({
    organization_id: ctx.organizationId,
    requested_by: ctx.userId,
    idempotency_key: data.idempotency_key,
    type: data.type,
  });
  if (!created) {
    if (job.type !== data.type) {
      throw new HTTPException(409, { message: 'Export idempotency key was reused for a different export type' });
    }
    return toResponse(job);
  }

  try {
    await addPracticeExportJob({ exportId: job.id, organizationId: ctx.organizationId });
  } catch (error) {
    await practiceExportJobsRepository.markFailed(
      ctx.organizationId,
      job.id,
      'QUEUE_UNAVAILABLE',
      'Export could not be queued for processing'
    );
    throw new Error('Failed to queue practice export', { cause: error });
  }
  return toResponse(job);
};

const getExport = async ({ id }: { id: string }, ctx: ServiceContext): Promise<PracticeExportJobResponse> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'DataExport');
  const job = await practiceExportJobsRepository.findById(ctx.organizationId, id);
  if (!job) {
    throw new HTTPException(404, { message: 'Practice export not found' });
  }
  return toResponse(job);
};

export const practiceExportsService = { requestExport, getExport };
