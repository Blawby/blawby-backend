import { z } from '@hono/zod-openapi';

export const trustReconciliationInputSchema = z.object({
  idempotency_key: z.uuid(),
  statement_ending_at: z.iso.datetime({ offset: true }),
  bank_statement_balance: z.number().int().min(0).describe('Bank statement ending balance in cents'),
  trust_book_balance: z.number().int().min(0).describe('Practice trust-account book balance in cents'),
  notes: z.string().max(2000).optional(),
});

export const trustReconciliationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  idempotency_key: z.uuid(),
  statement_ending_at: z.iso.datetime({ offset: true }),
  bank_statement_balance: z.number().int(),
  trust_book_balance: z.number().int(),
  client_ledger_balance: z.number().int(),
  bank_to_book_variance: z.number().int(),
  book_to_client_variance: z.number().int(),
  status: z.enum(['balanced', 'variance']),
  source: z.enum(['manual_statement', 'bank_integration']),
  notes: z.string().nullable(),
  created_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
});

export const trustRetainerTargetSchema = z.object({
  client_id: z.uuid(),
  matter_id: z.uuid(),
  current_balance: z.number().int(),
  target_balance: z.number().int().min(0),
  funded_percent: z.number().int().min(0),
  status: z.enum(['funded', 'low']),
});

export const trustReadinessSchema = z.object({
  ledger: z.object({
    client_ledger_balance: z.number().int(),
    as_of_at: z.iso.datetime({ offset: true }).nullable(),
  }),
  latest_reconciliation: trustReconciliationSchema.nullable(),
  retainer_targets: z.array(trustRetainerTargetSchema),
  boundaries: z.object({
    bank_source: z.enum(['not_configured', 'manual_statement', 'bank_integration']),
    operating_account_status: z.literal('not_connected'),
    invoice_receivables_included: z.literal(false),
    operating_revenue_included: z.literal(false),
  }),
});

export type TrustReconciliationInput = z.infer<typeof trustReconciliationInputSchema>;
export type TrustReconciliationResponse = z.infer<typeof trustReconciliationSchema>;
export type TrustRetainerTarget = z.infer<typeof trustRetainerTargetSchema>;
export type TrustReadinessResponse = z.infer<typeof trustReadinessSchema>;
