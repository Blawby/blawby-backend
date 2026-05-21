/**
 * Filter types for Invoice query functions.
 * Extracted from inline definitions for better reusability.
 */

/** Filters for listInvoicesByOrganization */
export interface InvoiceListFilters {
  invoiceId?: string;
  clientId?: string;
  matterId?: string;
  status?: string;
  page?: number;
  limit?: number;
}
