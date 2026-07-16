import {
  practiceExportJobs,
  type InsertPracticeExportJob,
  type PracticeExportJob,
} from '@/modules/practice-exports/database/schema/practice-export-jobs.schema';
import { getActiveTx } from '@/shared/database/uow';
import { and, eq } from 'drizzle-orm';

const findById = async (organizationId: string, id: string): Promise<PracticeExportJob | undefined> => {
  const [job] = await getActiveTx()
    .select()
    .from(practiceExportJobs)
    .where(and(eq(practiceExportJobs.id, id), eq(practiceExportJobs.organization_id, organizationId)))
    .limit(1);
  return job;
};

const findByIdempotencyKey = async (
  organizationId: string,
  idempotencyKey: string
): Promise<PracticeExportJob | undefined> => {
  const [job] = await getActiveTx()
    .select()
    .from(practiceExportJobs)
    .where(
      and(
        eq(practiceExportJobs.organization_id, organizationId),
        eq(practiceExportJobs.idempotency_key, idempotencyKey)
      )
    )
    .limit(1);
  return job;
};

const create = async (data: InsertPracticeExportJob): Promise<{ job: PracticeExportJob; created: boolean }> => {
  const [job] = await getActiveTx()
    .insert(practiceExportJobs)
    .values(data)
    .onConflictDoNothing({ target: [practiceExportJobs.organization_id, practiceExportJobs.idempotency_key] })
    .returning();
  if (job) {
    return { job, created: true };
  }
  const existing = await findByIdempotencyKey(data.organization_id, data.idempotency_key);
  if (!existing) {
    throw new Error('Failed to create export job');
  }
  return { job: existing, created: false };
};

const markFailed = async (organizationId: string, id: string, code: string, message: string): Promise<void> => {
  await getActiveTx()
    .update(practiceExportJobs)
    .set({ status: 'failed', error_code: code, error_message: message, failed_at: new Date() })
    .where(and(eq(practiceExportJobs.id, id), eq(practiceExportJobs.organization_id, organizationId)));
};

const markRunning = async (organizationId: string, id: string): Promise<PracticeExportJob | undefined> => {
  const [job] = await getActiveTx()
    .update(practiceExportJobs)
    .set({ status: 'running', started_at: new Date(), error_code: null, error_message: null, failed_at: null })
    .where(and(eq(practiceExportJobs.id, id), eq(practiceExportJobs.organization_id, organizationId)))
    .returning();
  return job;
};

const markCompleted = async (
  organizationId: string,
  id: string,
  result: { storageKey: string; contentType: string; byteSize: number; manifest: Record<string, unknown> }
): Promise<void> => {
  await getActiveTx()
    .update(practiceExportJobs)
    .set({
      status: 'completed',
      storage_key: result.storageKey,
      content_type: result.contentType,
      byte_size: result.byteSize,
      manifest: result.manifest,
      completed_at: new Date(),
      failed_at: null,
      error_code: null,
      error_message: null,
    })
    .where(and(eq(practiceExportJobs.id, id), eq(practiceExportJobs.organization_id, organizationId)));
};

export const practiceExportJobsRepository = {
  findById,
  findByIdempotencyKey,
  create,
  markFailed,
  markRunning,
  markCompleted,
};
