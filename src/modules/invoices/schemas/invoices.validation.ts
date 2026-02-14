import { z } from '@hono/zod-openapi';
import { uuidValidator } from '@/shared/validations/common';

// Line item validation
const invoiceLineItemRequestSchema = z.object({
  type: z.enum(['service', 'time_entry', 'expense', 'flat_fee', 'retainer', 'other']),
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().int().min(1).default(1),
  unit_price: z.number().int().min(0), // in cents
  time_entry_id: uuidValidator.optional(),
  expense_id: uuidValidator.optional(),
  sort_order: z.number().int().min(0).optional(),
}).strict();

// Create invoice schema
const createInvoiceSchema = z.object({
  client_id: uuidValidator,
  matter_id: uuidValidator.optional(),
  connected_account_id: uuidValidator,
  invoice_number: z.string().min(1, 'Invoice number is required').max(50),
  invoice_type: z.enum(['flat_fee', 'phase_fee', 'retainer_deposit']).default('flat_fee'),
  due_date: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
  memo: z.string().optional(),
  line_items: z.array(invoiceLineItemRequestSchema).min(1, 'At least one line item is required'),
}).strict();

// Update invoice schema (only for draft invoices)
const updateInvoiceSchema = z.object({
  due_date: z.string().or(z.date()).optional(),
  notes: z.string().optional(),
  memo: z.string().optional(),
  line_items: z.array(invoiceLineItemRequestSchema).optional(),
  status: z.enum(['draft', 'pending', 'sent', 'overdue', 'cancelled']).optional(),
}).strict();

const invoiceIdParamSchema = z.object({
  id: uuidValidator,
});

const listInvoicesQuerySchema = z.object({
  invoice_id: uuidValidator.optional(),
  client_id: uuidValidator.optional(),
  matter_id: uuidValidator.optional(),
  status: z.enum(['draft', 'pending', 'sent', 'paid', 'overdue', 'cancelled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// OpenAPI Schemas
const lineItemSchema = z.object({
  id: z.uuid(),
  invoice_id: z.uuid(),
  type: z.string(),
  description: z.string(),
  quantity: z.number(),
  unit_price: z.number(),
  line_total: z.number(),
  time_entry_id: z.uuid().nullable(),
  expense_id: z.uuid().nullable(),
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
}).openapi('InvoiceLineItem');

const invoiceSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  client_id: z.uuid(),
  matter_id: z.uuid().nullable(),
  connected_account_id: z.uuid(),
  invoice_number: z.string(),
  invoice_type: z.string(),
  fund_destination: z.string(),
  status: z.string(),
  subtotal: z.number(),
  tax_amount: z.number(),
  discount_amount: z.number(),
  total: z.number(),
  amount_paid: z.number(),
  amount_due: z.number(),
  issue_date: z.string().nullable(),
  due_date: z.string().nullable(),
  paid_at: z.string().nullable(),
  stripe_invoice_id: z.string().nullable(),
  stripe_payment_intent_id: z.string().nullable(),
  stripe_hosted_invoice_url: z.string().nullable(),
  notes: z.string().nullable(),
  memo: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  line_items: z.array(lineItemSchema).optional(),
  client: z.object({
    id: z.uuid(),
    status: z.string(),
    user: z.object({
      id: z.uuid(),
      name: z.string(),
      email: z.string(),
      image: z.string().nullable(),
    }),
  }).optional(),
  matter: z.any().optional(),
}).openapi('Invoice');

export const invoiceValidations = {
  invoiceLineItemRequestSchema,
  createInvoiceSchema,
  updateInvoiceSchema,
  invoiceIdParamSchema,
  listInvoicesQuerySchema,
  invoiceSchema,
  lineItemSchema,
};
