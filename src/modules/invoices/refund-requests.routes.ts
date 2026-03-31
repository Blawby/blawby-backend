import { createRoute, z } from '@hono/zod-openapi';
import { errorResponseSchema, notFoundResponseSchema, practiceIdParamSchema } from '@/shared/validations/openapi';

export const refundStatusEnum = z.enum([
  'requested',
  'approved',
  'rejected',
  'executed',
  'failed',
  'cancelled',
  'executing',
]);

export const refundRequestSchema = z
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
    executed_at: z.string().datetime().nullable(),
    executed_by_user_id: z.uuid().nullable(),
    reviewed_at: z.string().datetime().nullable(),
    reviewed_by_user_id: z.uuid().nullable(),
    review_notes: z.string().nullable(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .openapi('RefundRequest', { description: 'A client refund request' });

const refundRequestIdParam = practiceIdParamSchema.extend({
  id: z.uuid().openapi({ param: { name: 'id', in: 'path' }, description: 'Refund request ID' }),
});

export const createRefundRequestRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/client/refund-requests',
  tags: ['Client Refund Requests'],
  summary: 'Request a refund',
  description: 'Client creates a refund request for a paid invoice.',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: z.object({
            invoice_id: z.uuid(),
            requested_amount: z.number().int().min(1),
            reason: z.string().min(1).max(2000),
            notes: z.string().max(5000).optional(),
          }),
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

export const listClientRefundRequestsRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/client/refund-requests',
  tags: ['Client Refund Requests'],
  summary: 'List my refund requests',
  description: 'List all refund requests created by the authenticated client.',
  request: { params: practiceIdParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ refundRequests: z.array(refundRequestSchema) }) } },
      description: 'Refund requests retrieved',
    },
  },
});

export const cancelRefundRequestRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/client/refund-requests/{id}/cancel',
  tags: ['Client Refund Requests'],
  summary: 'Cancel a refund request',
  description: 'Client cancels a pending refund request.',
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

export const listPracticeRefundRequestsRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/refund-requests',
  tags: ['Practice Refund Requests'],
  summary: 'List all refund requests',
  description: 'Practice lists all incoming refund requests with optional filters.',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      status: refundStatusEnum.optional(),
      invoice_id: z.uuid().optional(),
      client_user_details_id: z.uuid().optional(),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ refundRequests: z.array(refundRequestSchema) }) } },
      description: 'Refund requests retrieved',
    },
  },
});

export const reviewRefundRequestRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/refund-requests/{id}',
  tags: ['Practice Refund Requests'],
  summary: 'Approve or reject a refund request',
  description: 'Practice approves or rejects a pending refund request.',
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

export const executeRefundRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/refund-requests/{id}/execute',
  tags: ['Practice Refund Requests'],
  summary: 'Execute a Stripe refund',
  description: 'Practice executes an approved refund via Stripe.',
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
