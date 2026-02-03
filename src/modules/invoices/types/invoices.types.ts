import { z } from 'zod';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import type { SelectInvoiceLineItem } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import type { SelectInvoice } from '@/modules/invoices/database/schema/invoices.schema';
import type { SelectPaymentLink } from '@/modules/invoices/database/schema/payment-links.schema';
import { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';

/**
 * Invoice with line items and relations
 */
export type InvoiceWithRelations = SelectInvoice & {
  lineItems?: SelectInvoiceLineItem[];
  client?: {
    id: string;
    status: string;
    stripe_customer_id: string | null;
    user: {
      id: string;
      name: string;
      email: string;
      image: string | null;
    };
  };
  matter?: SelectMatter | null; // Matter relations
};

/**
 * Invoice list response
 */
export type InvoiceListResponse = {
  invoices: SelectInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Inferred from Zod schemas
export type CreateInvoiceRequest = z.infer<typeof invoiceValidations.createInvoiceSchema>;
export type UpdateInvoiceRequest = z.infer<typeof invoiceValidations.updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof invoiceValidations.listInvoicesQuerySchema>;
export type InvoiceResponse = z.infer<typeof invoiceValidations.invoiceSchema>;
export type InvoiceLineItemResponse = z.infer<typeof invoiceValidations.lineItemSchema>;

export type {
  SelectInvoice,
  SelectInvoiceLineItem,
  SelectPaymentLink,
  SelectBillingTransaction,
};
