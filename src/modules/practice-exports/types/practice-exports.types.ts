import { z } from '@hono/zod-openapi';

const practiceExportTypeSchema = z.enum([
  'full_practice_archive',
  'matters_contacts',
  'billing_invoices',
  'trust_ledger',
  'audit_events',
]);
const practiceExportStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
const createPracticeExportSchema = z.object({ type: practiceExportTypeSchema, idempotency_key: z.uuid() });
const practiceExportParamsSchema = z.object({ practice_id: z.uuid(), export_id: z.uuid() });
const practiceExportJobSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  requested_by: z.uuid(),
  idempotency_key: z.uuid(),
  type: practiceExportTypeSchema,
  status: practiceExportStatusSchema,
  content_type: z.string().nullable(),
  byte_size: z.number().int().nonnegative().nullable(),
  manifest: z.record(z.string(), z.unknown()).nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  created_at: z.iso.datetime(),
  started_at: z.iso.datetime().nullable(),
  completed_at: z.iso.datetime().nullable(),
  failed_at: z.iso.datetime().nullable(),
  download: z
    .object({ url: z.url(), expires_at: z.iso.datetime() })
    .nullable()
    .describe('Present only for completed exports; URL is generated on demand and is never persisted.'),
});

type CreatePracticeExportRequest = z.infer<typeof createPracticeExportSchema>;
type PracticeExportJobResponse = z.infer<typeof practiceExportJobSchema>;

export {
  createPracticeExportSchema,
  practiceExportJobSchema,
  practiceExportParamsSchema,
  practiceExportStatusSchema,
  practiceExportTypeSchema,
};
export type { CreatePracticeExportRequest, PracticeExportJobResponse };
