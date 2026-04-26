import type { InvoiceSummary, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import type { PaginatedResponse } from '@/shared/types/pagination';

type SerializedInvoice<T extends InvoiceSummary | InvoiceWithRelations> = Omit<T, 'lineItems'> & {
  line_items?: T extends InvoiceWithRelations ? InvoiceWithRelations['lineItems'] : never;
};

export const serializeInvoice = <T extends InvoiceSummary | InvoiceWithRelations>(invoice: T): SerializedInvoice<T> => {
  if ('lineItems' in invoice) {
    const { lineItems, ...rest } = invoice;
    return { ...rest, line_items: lineItems } as SerializedInvoice<T>;
  }

  return invoice as SerializedInvoice<T>;
};

export const serializePaginatedInvoices = <T extends InvoiceSummary | InvoiceWithRelations>(
  response: PaginatedResponse<T>
): PaginatedResponse<SerializedInvoice<T>> => {
  const serializedData = response.data.map((invoice) => serializeInvoice(invoice));

  if (response.pagination !== undefined) {
    return {
      data: serializedData,
      pagination: response.pagination,
    };
  }

  return {
    data: serializedData,
    page_info: response.page_info,
  };
};
