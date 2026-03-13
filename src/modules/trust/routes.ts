import { createRoute, z } from '@hono/zod-openapi';
import { practiceIdParamSchema } from '@/shared/validations/openapi';

const trustTransactionSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    client_id: z.uuid(),
    matter_id: z.uuid().nullable(),
    transaction_type: z.enum(['deposit', 'withdrawal', 'transfer', 'refund']),
    amount: z.number(),
    balance_after: z.number(),
    description: z.string().nullable(),
    source: z.string().nullable(),
    invoice_id: z.uuid().nullable(),
    stripe_payment_intent_id: z.string().nullable(),
    created_at: z.string().datetime(),
    created_by: z.uuid(),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('TrustTransaction', { description: 'A trust ledger transaction record' });

export const getTrustTransactionsRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/transactions',
  tags: ['Trust'],
  summary: 'List trust transactions',
  description: 'List trust transactions for an org, filterable by client and matter.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      client_id: z.uuid().optional(),
      matter_id: z.uuid().optional(),
      start_date: z.iso.datetime({ offset: true }).optional(),
      end_date: z.iso.datetime({ offset: true }).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ transactions: z.array(trustTransactionSchema) }),
        },
      },
      description: 'Trust transactions retrieved',
    },
  },
});

export const getTrustBalanceRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/balance',
  tags: ['Trust'],
  summary: 'Get trust balance',
  description: 'Get current trust balance for a client.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      client_id: z.uuid(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            total: z.number(),
            byMatter: z.array(
              z.object({
                matter_id: z.uuid().nullable(),
                balance: z.number(),
              })
            ),
          }),
        },
      },
      description: 'Trust balance retrieved',
    },
  },
});

export const getTrustReportRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/report',
  tags: ['Trust'],
  summary: 'Trust report',
  description: 'IOLTA compliance report for trust transactions in a date range.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      start_date: z.iso.datetime({ offset: true }).optional(),
      end_date: z.iso.datetime({ offset: true }).optional(),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ transactions: z.array(trustTransactionSchema) }),
        },
      },
      description: 'Trust report retrieved',
    },
  },
});
