import type { InvoiceSummary, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import type { PaginatedResponse } from '@/shared/types/pagination';

type SerializedInvoice<T extends InvoiceSummary | InvoiceWithRelations> = Omit<T, 'lineItems'> & {
  line_items?: T extends InvoiceWithRelations ? InvoiceWithRelations['lineItems'] : never;
};

const toIsoOrValue = <T>(value: T): T | string => (value instanceof Date ? value.toISOString() : value);

const serializeLineItem = <T extends Record<string, unknown>>(lineItem: T): T =>
  ({
    ...lineItem,
    created_at: toIsoOrValue(lineItem.created_at),
    updated_at: toIsoOrValue(lineItem.updated_at),
  }) as T;

export const serializeInvoice = <T extends InvoiceSummary | InvoiceWithRelations>(invoice: T): SerializedInvoice<T> => {
  if ('lineItems' in invoice) {
    const { lineItems, ...rest } = invoice;
    return {
      ...rest,
      issue_date: toIsoOrValue(rest.issue_date),
      due_date: toIsoOrValue(rest.due_date),
      paid_at: toIsoOrValue(rest.paid_at),
      created_at: toIsoOrValue(rest.created_at),
      updated_at: toIsoOrValue(rest.updated_at),
      line_items: lineItems?.map((lineItem) => serializeLineItem(lineItem)),
    } as SerializedInvoice<T>;
  }

  return {
    ...invoice,
    issue_date: toIsoOrValue(invoice.issue_date),
    due_date: toIsoOrValue(invoice.due_date),
    paid_at: toIsoOrValue(invoice.paid_at),
    created_at: toIsoOrValue(invoice.created_at),
    updated_at: toIsoOrValue(invoice.updated_at),
  } as SerializedInvoice<T>;
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
