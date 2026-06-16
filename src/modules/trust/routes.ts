import { z } from '@hono/zod-openapi';
import { trustService } from '@/modules/trust/services/trust.service';
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
  mcp: {
    name: 'create_trust_deposit',
    scope: 'trust:write',
    approval: {
      required: true,
      message: 'Record this manual trust deposit? This changes the client trust ledger.',
      confirm_title: 'Record deposit',
    },
    handler: async (args, ctx) =>
      trustService.manualDeposit(
        { data: args as unknown as Parameters<typeof trustService.manualDeposit>[0]['data'] },
        ctx
      ),
  },
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
  mcp: {
    name: 'create_trust_withdrawal',
    scope: 'trust:write',
    approval: {
      required: true,
      message: 'Record this manual trust withdrawal? This changes the client trust ledger.',
      confirm_title: 'Record withdrawal',
    },
    handler: async (args, ctx) =>
      trustService.manualWithdrawal(
        { data: args as unknown as Parameters<typeof trustService.manualWithdrawal>[0]['data'] },
        ctx
      ),
  },
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
  mcp: {
    name: 'list_trust_transactions',
    scope: 'trust:read',
    handler: async (args, ctx) =>
      trustService.getTransactions(
        {
          organizationId: ctx.organizationId,
          clientId: args.client_id as string | undefined,
          matterId: args.matter_id as string | undefined,
          startDate: typeof args.start_date === 'string' ? new Date(args.start_date) : undefined,
          endDate: typeof args.end_date === 'string' ? new Date(args.end_date) : undefined,
        },
        ctx
      ),
  },
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
  mcp: {
    name: 'get_trust_balance',
    scope: 'trust:read',
    handler: async (args, ctx) =>
      trustService.getBalance({ organizationId: ctx.organizationId, clientId: args.client_id as string }, ctx),
  },
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
  mcp: {
    name: 'get_trust_report',
    scope: 'trust:read',
    handler: async (args, ctx) =>
      trustService.getReport(
        {
          organizationId: ctx.organizationId,
          startDate: typeof args.start_date === 'string' ? new Date(args.start_date) : undefined,
          endDate: typeof args.end_date === 'string' ? new Date(args.end_date) : undefined,
        },
        ctx
      ),
  },
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
  mcp: {
    name: 'list_trust_client_balances',
    scope: 'trust:read',
    handler: async (_args, ctx) => trustService.getClientBalances({}, ctx),
  },
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
