import { createRoute, z } from '@hono/zod-openapi';
import { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
} from '@/shared/validations/openapi';

const invoiceUuidParamSchema = practiceIdParamSchema.extend({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Invoice ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

// ==================== INVOICES ====================

export const createInvoiceRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/invoices',
  tags: ['Invoices'],
  summary: 'Create invoice',
  description: 'Create a new invoice with line items',
  request: {
    params: practiceIdParamSchema,
    body: {
      content: {
        'application/json': {
          schema: invoiceValidations.createInvoiceSchema,
        },
      },
    },
  },
  responses: {
    201: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice created',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const getInvoicesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/invoices',
  tags: ['Invoices'],
  summary: 'List invoices',
  description: 'Get all invoices for a practice',
  request: {
    params: practiceIdParamSchema,
    query: invoiceValidations.listInvoicesQuerySchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            invoices: z.array(invoiceValidations.invoiceSchema),
            total: z.number(),
          }),
        },
      },
      description: 'Invoices retrieved successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const getInvoiceRoute = createRoute({
  method: 'get',
  path: '/{practice_id}/invoices/{id}',
  tags: ['Invoices'],
  summary: 'Get invoice',
  description: 'Get a single invoice by ID',
  request: {
    params: invoiceUuidParamSchema,
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice retrieved successfully',
    },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

export const updateInvoiceRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/invoices/{id}',
  tags: ['Invoices'],
  summary: 'Update invoice',
  description: 'Update a draft invoice',
  request: {
    params: invoiceUuidParamSchema,
    body: {
      content: {
        'application/json': {
          schema: invoiceValidations.updateInvoiceSchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice updated',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

export const deleteInvoiceRoute = createRoute({
  method: 'delete',
  path: '/{practice_id}/invoices/{id}',
  tags: ['Invoices'],
  summary: 'Delete invoice',
  description: 'Soft delete a draft invoice',
  request: { params: invoiceUuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Invoice deleted successfully',
    },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

export const sendInvoiceRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/invoices/{id}/send',
  tags: ['Invoices'],
  summary: 'Send invoice',
  description: 'Finalize and send an invoice via Stripe',
  request: { params: invoiceUuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice sent successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

export const syncInvoiceRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/invoices/{id}/sync',
  tags: ['Invoices'],
  summary: 'Sync invoice',
  description: 'Sync invoice status with Stripe',
  request: { params: invoiceUuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice synced successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

// Public Invoice Routes

export const getPublicInvoiceRoute = createRoute({
  method: 'get',
  path: '/invoices/public/{token}',
  tags: ['Invoices'],
  summary: 'Get public invoice',
  description: 'Public endpoint to retrieve invoice details by payment token',
  request: {
    params: z.object({
      token: z.string().min(32).describe('Secure payment token'),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            invoice: invoiceValidations.invoiceSchema,
          }),
        },
      },
      description: 'Invoice details retrieved',
    },
    404: {
      content: { 'application/json': { schema: notFoundResponseSchema } },
      description: 'Invalid or expired payment link',
    },
    400: {
      content: { 'application/json': { schema: errorResponseSchema } },
      description: 'Invalid request',
    },
  },
});
