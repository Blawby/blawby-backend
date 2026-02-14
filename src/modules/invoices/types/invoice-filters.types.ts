/**
 * Filter types for Invoice query functions.
 * Extracted from inline definitions for better reusability.
 */

/** Filters for listInvoicesByOrganization */
export type InvoiceListFilters = {
  invoiceId?: string;
  clientId?: string;
  matterId?: string;
  status?: string;
  page?: number;
  limit?: number;
};
