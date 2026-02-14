import { createRoute, z } from '@hono/zod-openapi';
import { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
import {
  errorResponseSchema,
  notFoundResponseSchema,
  practiceIdParamSchema,
} from '@/shared/validations/openapi';

const invoiceUuidParamSchema = practiceIdParamSchema.extend({
  invoice_id: z.uuid().openapi({
    param: { name: 'invoice_id', in: 'path' },
    description: 'Invoice ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

// ==================== INVOICES ====================

export const createInvoiceRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/create',
  tags: ['Invoices'],
  summary: 'Create invoice',
  description: 'Create a new draft invoice. The client_id can be either a User ID or a UserDetails ID; the system will automatically resolve and create the necessary client records in a non-blocking way.',
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
    204: {
      description: 'Invoice created successfully (no content)',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
  },
});

export const getInvoicesRoute = createRoute({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Invoices'],
  summary: 'List invoices or get by ID',
  description: 'Get all invoices for a practice. Use the `invoice_uuid` query parameter to retrieve a specific invoice.',
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


export const updateInvoiceRoute = createRoute({
  method: 'patch',
  path: '/{practice_id}/update/{invoice_id}',
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
  path: '/{practice_id}/delete/{invoice_id}',
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
  path: '/{practice_id}/{invoice_id}/send',
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
  path: '/{practice_id}/{invoice_id}/sync',
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

export const voidInvoiceRoute = createRoute({
  method: 'post',
  path: '/{practice_id}/{invoice_id}/void',
  tags: ['Invoices'],
  summary: 'Void invoice',
  description: 'Void a sent invoice (cannot be undone)',
  request: { params: invoiceUuidParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice voided successfully',
    },
    400: { content: { 'application/json': { schema: errorResponseSchema } }, description: 'Invalid request' },
    404: { content: { 'application/json': { schema: notFoundResponseSchema } }, description: 'Invoice not found' },
  },
});

