import { z } from '@hono/zod-openapi';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  paginationSchema,
  practiceIdParamSchema,
} from '@/shared/validations/openapi';
import { refundRequestsService } from '@/modules/invoices/services/refund-requests.service';
import { routeBuilder } from '@/shared/router/route-builder';

const refundRequestIdParam = practiceIdParamSchema.extend({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Refund request ID' }),
});

const refundStatusEnum = z.enum(['requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled', 'executing']);

const refundRequestsQueryPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const refundRequestSchema = z
  .object({
    id: z.uuid(),
    organization_id: z.uuid(),
    invoice_id: z.uuid(),
    client_user_details_id: z.uuid(),
    created_by_user_details_id: z.uuid(),
    requested_amount: z.number(),
    currency: z.string(),
    reason: z.string(),
    notes: z.string().nullable(),
    status: refundStatusEnum,
    stripe_refund_id: z.string().nullable(),
    stripe_payment_intent_id: z.string().nullable(),
    executed_amount: z.number().nullable(),
    executed_at: z.iso.datetime({ offset: true }).nullable(),
    executed_by_user_id: z.uuid().nullable(),
    reviewed_at: z.iso.datetime({ offset: true }).nullable(),
    reviewed_by_user_id: z.uuid().nullable(),
    review_notes: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),

    updated_at: z.iso.datetime({ offset: true }),
  })
  .openapi('RefundRequest', { description: 'A client refund request' });

const createRefundRequestBodySchema = z.object({
  invoice_id: z.uuid(),
  requested_amount: z.number().int().min(1),
  reason: z.string().min(1).max(2000),
  notes: z.string().max(5000).optional(),
});

const createRefundRequestRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/client/refund-requests',
  tags: ['Client Refund Requests'],
  summary: 'Request a refund',
  description: 'Client creates a refund request for a paid invoice.',
  mcp: {
    name: 'create_refund_request',
    scope: 'invoices:write',
    approval: {
      required: true,
      message: 'Create a refund request for this invoice?',
      confirm_title: 'Create refund request',
    },
    schema: createRefundRequestBodySchema.shape,
    handler: async (args, ctx) => {
      const parsed = createRefundRequestBodySchema.parse(args);
      return refundRequestsService.createRequest(
        {
          invoiceId: parsed.invoice_id,
          requestedAmount: parsed.requested_amount,
          reason: parsed.reason,
          notes: parsed.notes,
        },
        ctx
      );
    },
  },
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: createRefundRequestBodySchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ refundRequest: refundRequestSchema }) } },
      description: 'Refund request created',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

const listClientRefundRequestsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/refund-requests',
  tags: ['Client Refund Requests'],
  summary: 'List my refund requests',
  description: 'List all refund requests created by the authenticated client.',
  mcp: {
    name: 'list_client_refund_requests',
    scope: 'invoices:read',
    schema: refundRequestsQueryPaginationSchema.shape,
    handler: async (args, ctx) => refundRequestsService.listClientRequests(ctx, args),
  },
  request: { params: practiceIdParamSchema, query: refundRequestsQueryPaginationSchema },
  responses: {
    200: {
      content: {
        'application/json': { schema: z.object({ data: z.array(refundRequestSchema), pagination: paginationSchema }) },
      },
      description: 'Refund requests retrieved',
    },
  },
});

const cancelRefundRequestRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/client/refund-requests/{id}/cancel',
  tags: ['Client Refund Requests'],
  summary: 'Cancel a refund request',
  description: 'Client cancels a pending refund request.',
  mcp: {
    name: 'cancel_refund_request',
    scope: 'invoices:write',
    approval: {
      required: true,
      message: 'Cancel this refund request?',
      confirm_title: 'Cancel refund request',
    },
    schema: { id: z.uuid() },
    handler: async (args, ctx) => refundRequestsService.cancelRequest({ requestId: args.id as string }, ctx),
  },
  request: { params: refundRequestIdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ refundRequest: refundRequestSchema }) } },
      description: 'Refund request cancelled',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
  },
});

const listPracticeRefundRequestsRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/refund-requests',
  tags: ['Practice Refund Requests'],
  summary: 'List all refund requests',
  description: 'Practice lists all incoming refund requests with optional filters.',
  mcp: {
    name: 'list_refund_requests',
    scope: 'invoices:read',
    schema: {
      status: refundStatusEnum.optional(),
      invoice_id: z.uuid().optional(),
      client_user_details_id: z.uuid().optional(),
      ...refundRequestsQueryPaginationSchema.shape,
    },
    handler: async (args, ctx) => refundRequestsService.listPracticeRequests(ctx, args),
  },
  request: {
    params: practiceIdParamSchema,
    query: z
      .object({
        status: refundStatusEnum.optional(),
        invoice_id: z.uuid().optional(),
        client_user_details_id: z.uuid().optional(),
      })
      .extend(refundRequestsQueryPaginationSchema.shape),
  },
  responses: {
    200: {
      content: {
        'application/json': { schema: z.object({ data: z.array(refundRequestSchema), pagination: paginationSchema }) },
      },
      description: 'Refund requests retrieved',
    },
  },
});

const reviewRefundRequestRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/refund-requests/{id}',
  tags: ['Practice Refund Requests'],
  summary: 'Approve or reject a refund request',
  description: 'Practice approves or rejects a pending refund request.',
  mcp: {
    name: 'review_refund_request',
    scope: 'invoices:write',
    approval: {
      required: true,
      message: 'Approve or reject this refund request?',
      confirm_title: 'Review refund request',
    },
    handler: async (args, ctx) =>
      refundRequestsService.reviewRequest(
        {
          requestId: args.id as string,
          action: args.action as Parameters<typeof refundRequestsService.reviewRequest>[0]['action'],
          reviewNotes: args.review_notes as string | undefined,
        },
        ctx
      ),
  },
  request: {
    params: refundRequestIdParam,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            action: z.enum(['approved', 'rejected']),
            review_notes: z.string().max(5000).optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ refundRequest: refundRequestSchema }) } },
      description: 'Refund request reviewed',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
  },
});

const executeRefundRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/refund-requests/{id}/execute',
  tags: ['Practice Refund Requests'],
  summary: 'Execute a Stripe refund',
  description: 'Practice executes an approved refund via Stripe.',
  mcp: {
    name: 'execute_refund',
    scope: 'invoices:write',
    approval: {
      required: true,
      message: 'Execute this Stripe refund? This financial action cannot be undone.',
      confirm_title: 'Execute refund',
    },
    schema: { id: z.uuid() },
    handler: async (args, ctx) => refundRequestsService.executeRefund({ requestId: args.id as string }, ctx),
  },
  request: { params: refundRequestIdParam },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ refundRequest: refundRequestSchema }) } },
      description: 'Refund executed',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Bad request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Not found' },
  },
});

export const refundRequestRoutes = {
  createRefundRequestRoute,
  listClientRefundRequestsRoute,
  cancelRefundRequestRoute,
  listPracticeRefundRequestsRoute,
  reviewRefundRequestRoute,
  executeRefundRoute,
};
