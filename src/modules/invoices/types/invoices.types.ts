import { BuildQueryResult, ExtractTablesWithRelations } from 'drizzle-orm';
import { z } from 'zod';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import type { SelectInvoiceLineItem } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import type { SelectInvoice } from '@/modules/invoices/database/schema/invoices.schema';
import type { SelectPaymentLink } from '@/modules/invoices/database/schema/payment-links.schema';
import { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
import * as schema from '@/schema';

type Schema = ExtractTablesWithRelations<typeof schema>;

/**
 * Invoice with line items and relations
 * Matches findInvoiceById result structure
 */
export type InvoiceWithRelations = BuildQueryResult<
  Schema,
  Schema['invoices'],
  {
    with: {
      lineItems: true;
      client: {
        with: { user: true };
      };
      matter: true;
      connectedAccount: true;
    };
  }
>;

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
