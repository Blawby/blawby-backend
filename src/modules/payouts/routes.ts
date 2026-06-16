import { z } from '@hono/zod-openapi';
import { payoutValidations } from '@/modules/payouts/schemas/payouts.validation';
import { payoutsService } from '@/modules/payouts/services/payouts.service';
import { routeBuilder } from '@/shared/router/route-builder';
import {
  badGatewayResponseSchema,
  forbiddenResponseSchema,
  notFoundResponseSchema,
  paginationSchema,
  practiceIdParamSchema,
  unauthorizedResponseSchema,
} from '@/shared/validations/openapi';

const payoutParamSchema = practiceIdParamSchema.extend({
  payout_id: z.uuid().openapi({
    param: { name: 'payout_id', in: 'path' },
    description: 'Payout ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

const listPayoutsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Payouts'],
  summary: 'List payouts',
  description: 'List the payout ledger (settlement batches) for a practice, newest first.',
  mcp: {
    name: 'list_payouts',
    scope: 'payouts:read',
    handler: async (args, ctx) =>
      payoutsService.listPayouts({ filters: args as Parameters<typeof payoutsService.listPayouts>[0]['filters'] }, ctx),
  },
  request: {
    params: practiceIdParamSchema,
    query: payoutValidations.listPayoutsQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            data: z.array(payoutValidations.payoutSchema),
            pagination: paginationSchema,
          }),
        },
      },
      description: 'Payouts retrieved successfully',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});

const getPayoutRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{payout_id}',
  tags: ['Payouts'],
  summary: 'Get payout',
  description: 'Get a single payout with the balance transactions that settled in that batch.',
  mcp: {
    name: 'get_payout',
    scope: 'payouts:read',
    schema: { payout_id: z.uuid() },
    handler: async (args, ctx) => payoutsService.getPayoutDetail({ id: args.payout_id as string }, ctx),
  },
  request: { params: payoutParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: payoutValidations.payoutDetailSchema } },
      description: 'Payout retrieved successfully',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Payout not found' },
    502: { content: { 'application/json': { schema: badGatewayResponseSchema } }, description: 'Bad Gateway' },
  },
});

export const routes = {
  listPayoutsRoute,
  getPayoutRoute,
};
