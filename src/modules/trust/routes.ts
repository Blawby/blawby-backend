import { z } from '@hono/zod-openapi';
import { routeBuilder } from '@/shared/router/route-builder';
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
    created_at: z.iso.datetime({ offset: true }),
    created_by: z.uuid().or(z.literal('webhook')),
    metadata: z.record(z.string(), z.unknown()).nullable(),
  })
  .openapi('TrustTransaction', { description: 'A trust ledger transaction record' });

const manualTrustBodySchema = z.object({
  matter_id: z.uuid(),
  client_id: z.uuid(),
  amount: z.number().int().min(1).describe('Amount in cents'),
  description: z.string().optional(),
});

const createDepositRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/deposit',
  tags: ['Trust'],
  summary: 'Record a manual trust deposit',
  description:
    'Staff-initiated retainer deposit. Creates a trust ledger entry, syncs matters.retainer_balance, and fires RetainerLowBalance if threshold is breached.',
  request: {
    params: practiceIdParamSchema,
    body: { content: { 'application/json': { schema: manualTrustBodySchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: trustTransactionSchema } },
      description: 'Trust deposit recorded',
    },
  },
});

const createWithdrawalRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/withdrawal',
  tags: ['Trust'],
  summary: 'Record a manual trust withdrawal',
  description:
    'Staff-initiated retainer withdrawal. Rejects if balance would go below 0. Syncs matters.retainer_balance and checks threshold.',
  request: {
    params: practiceIdParamSchema,
    body: { content: { 'application/json': { schema: manualTrustBodySchema } } },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: trustTransactionSchema } },
      description: 'Trust withdrawal recorded',
    },
  },
});

const getTrustTransactionsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/transactions',
  tags: ['Trust'],
  summary: 'List trust transactions',
  description:
    'List trust transactions for the organization, ordered by created_at DESC. When client_id is omitted, returns org-wide transactions; when provided, scopes to that client. Optionally filterable by matter_id and date range.',
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
      content: { 'application/json': { schema: z.array(trustTransactionSchema) } },
      description: 'Trust transactions retrieved',
    },
  },
});

const getTrustBalanceRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/balance',
  tags: ['Trust'],
  summary: 'Get trust balance',
  description: 'Get current trust balance for a client, broken down by matter.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({ client_id: z.uuid() }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            total: z.number(),
            byMatter: z.array(z.object({ matter_id: z.uuid().nullable(), balance: z.number() })),
          }),
        },
      },
      description: 'Trust balance retrieved',
    },
  },
});

const getTrustReportRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/report',
  tags: ['Trust'],
  summary: 'Trust report',
  description: 'IOLTA compliance report — trust transactions for an org in a date range.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      start_date: z.iso.datetime({ offset: true }).optional(),
      end_date: z.iso.datetime({ offset: true }).optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(trustTransactionSchema) } },
      description: 'Trust report retrieved',
    },
  },
});

const clientBalanceSchema = z
  .object({
    client_id: z.uuid(),
    balance: z.number().describe('Balance in cents'),
    as_of_date: z.iso.datetime({ offset: true }),
  })
  .openapi('TrustClientBalance', { description: 'Latest trust balance for a client' });

const getTrustClientBalancesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client-balances',
  tags: ['Trust'],
  summary: 'List latest trust balance per client',
  description:
    'Returns the latest trust balance_after per client across the organization, one row per client with the timestamp of the underlying transaction.',
  request: {
    params: practiceIdParamSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(clientBalanceSchema) } },
      description: 'Latest trust balance per client retrieved',
    },
  },
});

export const trustRoutes = {
  createDepositRoute,
  createWithdrawalRoute,
  getTrustTransactionsRoute,
  getTrustBalanceRoute,
  getTrustReportRoute,
  getTrustClientBalancesRoute,
};
