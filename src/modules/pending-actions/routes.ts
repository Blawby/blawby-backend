import { z } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
  unauthorizedResponseSchema,
  forbiddenResponseSchema,
} from '@/shared/validations/openapi';
import { routeBuilder } from '@/shared/router/route-builder';

const pendingActionIdParam = practiceIdParamSchema.extend({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Pending action ID' }),
});

const pendingActionStatusEnum = z.enum(['pending', 'rejected', 'executing', 'executed', 'failed', 'expired']);

const pendingActionSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    created_by_user_id: z.uuid(),
    tool_name: z.string(),
    tool_params: z.record(z.string(), z.unknown()),
    status: pendingActionStatusEnum,
    reviewed_by_user_id: z.uuid().nullable(),
    reviewed_at: z.iso.datetime({ offset: true }).nullable(),
    review_notes: z.string().nullable(),
    executed_at: z.iso.datetime({ offset: true }).nullable(),
    execution_error: z.string().nullable(),
    execution_result: z.unknown().nullable(),
    expires_at: z.iso.datetime({ offset: true }),
    created_at: z.iso.datetime({ offset: true }),
    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('PendingAction', {
    description:
      'A staged high-risk MCP write awaiting human approval before it executes (e.g. send_invoice). Created ' +
      'automatically by the MCP tool registry for any tool marked requiresApproval — never created directly.',
  });

const listPendingActionsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Pending Actions'],
  summary: 'List pending actions',
  description: 'List MCP-originated actions awaiting or having received approval, for this practice.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      status: pendingActionStatusEnum.optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ pendingActions: z.array(pendingActionSchema) }) } },
      description: 'Pending actions retrieved',
    },
    401: { content: { 'application/json': { schema: unauthorizedResponseSchema } }, description: 'Unauthorized' },
    403: { content: { 'application/json': { schema: forbiddenResponseSchema } }, description: 'Forbidden' },
  },
});

const getPendingActionRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/{id}',
  tags: ['Pending Actions'],
  summary: 'Get pending action',
  description: 'Get a single pending action by ID (e.g. to render an approval screen).',
  request: { params: pendingActionIdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ pendingAction: pendingActionSchema }) } },
      description: 'Pending action retrieved',
    },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
  },
});

const approvePendingActionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{id}/approve',
  tags: ['Pending Actions'],
  summary: 'Approve and execute a pending action',
  description: 'Approves a pending action and immediately executes the underlying tool call.',
  request: { params: pendingActionIdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ pendingAction: pendingActionSchema }) } },
      description: 'Pending action approved and executed',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Only pending actions can be approved',
    },
  },
});

const rejectPendingActionRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{id}/reject',
  tags: ['Pending Actions'],
  summary: 'Reject a pending action',
  description: 'Rejects a pending action without executing it.',
  request: {
    params: pendingActionIdParam,
    body: {
      content: {
        'application/json': {
          schema: z.object({ review_notes: z.string().max(5000).optional() }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ pendingAction: pendingActionSchema }) } },
      description: 'Pending action rejected',
    },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
    409: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Only pending actions can be rejected',
    },
  },
});

export const routes = {
  listPendingActionsRoute,
  getPendingActionRoute,
  approvePendingActionRoute,
  rejectPendingActionRoute,
};
