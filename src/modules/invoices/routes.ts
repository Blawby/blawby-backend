import { z } from '@hono/zod-openapi';
import { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
import { routeBuilder } from '@/shared/router/route-builder';
import {
  practiceIdParamSchema,
} from '@/shared/validations/openapi';

const invoiceParamSchema = practiceIdParamSchema.extend({
  id: z.uuid().openapi({
    param: { name: 'id', in: 'path' },
    description: 'Invoice ID (UUID)',
    example: '789a1234-b56c-78d9-e012-345678901234',
  }),
});

// ── Practice-side routes ─────────────────────────────────────

const createInvoiceRoute = routeBuilder.build({
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
  },
});

const getInvoicesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}',
  tags: ['Invoices'],
  summary: 'List invoices or get by ID',
  description: 'Get all invoices for a practice. Use the `invoice_id` query parameter to retrieve a specific invoice.',
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
  },
});

const updateInvoiceRoute = routeBuilder.build({
  method: 'patch',
  path: '/{practice_id}/update/{id}',
  tags: ['Invoices'],
  summary: 'Update invoice',
  description: 'Update a draft invoice',
  request: {
    params: invoiceParamSchema,
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
  },
});

const deleteInvoiceRoute = routeBuilder.build({
  method: 'delete',
  path: '/{practice_id}/delete/{id}',
  tags: ['Invoices'],
  summary: 'Delete invoice',
  description: 'Soft delete a draft invoice',
  request: { params: invoiceParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
      description: 'Invoice deleted successfully',
    },
  },
});

const sendInvoiceRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{id}/send',
  tags: ['Invoices'],
  summary: 'Send invoice',
  description: 'Finalize and send an invoice via Stripe',
  request: { params: invoiceParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice sent successfully',
    },
  },
});

const syncInvoiceRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{id}/sync',
  tags: ['Invoices'],
  summary: 'Sync invoice',
  description: 'Sync invoice status with Stripe',
  request: { params: invoiceParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice synced successfully',
    },
  },
});

const voidInvoiceRoute = routeBuilder.build({
  method: 'post',
  path: '/{practice_id}/{id}/void',
  tags: ['Invoices'],
  summary: 'Void invoice',
  description: 'Void a sent invoice (cannot be undone)',
  request: { params: invoiceParamSchema },
  responses: {
    200: {
      content: { 'application/json': { schema: z.object({ invoice: invoiceValidations.invoiceSchema }) } },
      description: 'Invoice voided successfully',
    },
  },
});

// ── Client-side routes (read-only, identity from session) ────

const getClientInvoicesRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client',
  tags: ['Client Invoices'],
  summary: 'List my invoices',
  description: 'List invoices for the authenticated client (no line items in list view).',
  request: {
    params: practiceIdParamSchema,
    query: z.object({
      status: z.enum(['draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({
            invoices: z.array(invoiceValidations.invoiceSchema),
            pagination: z.object({
              page: z.number().int(),
              limit: z.number().int(),
              total: z.number().int(),
            }),
          }),
        },
      },
      description: 'Client invoices retrieved',
    },
  },
});

const getClientInvoiceDetailRoute = routeBuilder.build({
  method: 'get',
  path: '/{practice_id}/client/{id}',
  tags: ['Client Invoices'],
  summary: 'Get my invoice detail',
  description: 'Get a single invoice for the authenticated client (includes line items).',
  request: { params: invoiceParamSchema },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.object({ invoice: invoiceValidations.invoiceSchema }),
        },
      },
      description: 'Client invoice detail retrieved',
    },
  },
});

export const routes = {
  createInvoiceRoute,
  getInvoicesRoute,
  updateInvoiceRoute,
  deleteInvoiceRoute,
  sendInvoiceRoute,
  syncInvoiceRoute,
  voidInvoiceRoute,
  getClientInvoicesRoute,
  getClientInvoiceDetailRoute,
};
