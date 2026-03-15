import type { BuildQueryResult, ExtractTablesWithRelations } from 'drizzle-orm';
import type { z } from '@hono/zod-openapi';
import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import type { SelectInvoiceLineItem } from '@/modules/invoices/database/schema/invoice-line-items.schema';
import type { SelectInvoice } from '@/modules/invoices/database/schema/invoices.schema';
import type { SelectPaymentLink } from '@/modules/invoices/database/schema/payment-links.schema';
import type { invoiceValidations } from '@/modules/invoices/schemas/invoices.validation';
// oxlint-disable-next-line import/no-namespace
import type * as schema from '@/schema';
import type { SelectMatter } from '@/modules/matters/database/schema/matters.schema';
import type { StripeConnectedAccount } from '@/modules/onboarding/schemas/onboarding.schema';

type Schema = ExtractTablesWithRelations<typeof schema>;

/**
 * Resolved client data with all necessary relations for invoice creation
 */
interface ResolvedClientForInvoice {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  status: string;
  organization_id: string;
  connectedAccount: StripeConnectedAccount | null;
  matters: SelectMatter[];
}

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
 * Invoice summary for list views (no line items)
 */
export type InvoiceSummary = BuildQueryResult<
  Schema,
  Schema['invoices'],
  {
    with: {
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
export interface InvoiceListResponse {
  invoices: SelectInvoice[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Inferred from Zod schemas
export type CreateInvoiceRequest = z.infer<typeof invoiceValidations.createInvoiceSchema>;
export type UpdateInvoiceRequest = z.infer<typeof invoiceValidations.updateInvoiceSchema>;
export type ListInvoicesQuery = z.infer<typeof invoiceValidations.listInvoicesQuerySchema>;
export type InvoiceResponse = z.infer<typeof invoiceValidations.invoiceSchema>;
export type InvoiceSummaryResponse = z.infer<typeof invoiceValidations.invoiceSummarySchema>;
export type InvoiceLineItemResponse = z.infer<typeof invoiceValidations.lineItemSchema>;

/**
 * Input for calculating or syncing line items
 */
export type InvoiceLineItemInput = z.infer<typeof invoiceValidations.invoiceLineItemRequestSchema>;

/**
 * Calculated invoice totals
 */
export interface InvoiceTotals {
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  amount_due: number;
}

export type InvoiceListFilters = z.infer<typeof invoiceValidations.listInvoicesQuerySchema> & {
  invoiceId?: string;
};

export type {
  SelectInvoice,
  SelectInvoiceLineItem,
  SelectPaymentLink,
  SelectBillingTransaction,
  ResolvedClientForInvoice,
};
