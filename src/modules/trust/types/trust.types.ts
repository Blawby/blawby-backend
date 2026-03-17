import { z } from '@hono/zod-openapi';

// Validation schemas for trust operations
export const recordDepositSchema = z.object({
  organizationId: z.uuid(),
  clientId: z.uuid(),
  matterId: z.uuid().nullable().optional(),
  amount: z.number().positive(),
  invoiceId: z.uuid().nullable().optional(),
  stripePaymentIntentId: z.string().nullable().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  createdBy: z.uuid().or(z.literal('webhook')),
});

export const recordWithdrawalSchema = z.object({
  organizationId: z.uuid(),
  clientId: z.uuid(),
  matterId: z.uuid().nullable().optional(),
  amount: z.number().positive(),
  invoiceId: z.uuid().nullable().optional(),
  stripePaymentIntentId: z.string().nullable().optional(),
  source: z.string().optional(),
  description: z.string().optional(),
  createdBy: z.uuid().or(z.literal('webhook')),
});

// Service parameter types (inferred from schemas)
export type RecordDepositParams = z.infer<typeof recordDepositSchema>;
export type RecordWithdrawalParams = z.infer<typeof recordWithdrawalSchema>;

// Service internal types
export interface GetTransactionsParams {
  organizationId: string;
  clientId?: string;
  matterId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface GetBalanceParams {
  organizationId: string;
  clientId: string;
}

export interface GetReportParams {
  organizationId: string;
  startDate?: Date;
  endDate?: Date;
}
