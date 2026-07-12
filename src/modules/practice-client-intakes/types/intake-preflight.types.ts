import { z } from '@hono/zod-openapi';

export const intakePreflightCheckKeySchema = z.enum([
  'conflict',
  'jurisdiction',
  'practice-fit',
  'capacity',
  'documents',
  'identity-verification',
]);

export const intakePreflightCheckStatusSchema = z.enum(['pass', 'review', 'block', 'not_available']);

export const intakePreflightCheckSchema = z.object({
  key: intakePreflightCheckKeySchema,
  status: intakePreflightCheckStatusSchema,
  summary: z.string(),
  evidence: z.array(z.string()),
});

export const intakePreflightResponseSchema = z.object({
  intake_id: z.uuid(),
  overall_status: z.enum(['ready', 'review', 'blocked']),
  generated_at: z.iso.datetime({ offset: true }),
  checks: z.array(intakePreflightCheckSchema).length(6),
});

export type IntakePreflightCheck = z.infer<typeof intakePreflightCheckSchema>;
export type IntakePreflightResponse = z.infer<typeof intakePreflightResponseSchema>;
