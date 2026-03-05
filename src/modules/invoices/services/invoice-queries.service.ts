import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import type {
  ListInvoicesQuery,
  InvoiceResponse,
  InvoiceWithRelations,
  SelectInvoiceLineItem,
} from '@/modules/invoices/types/invoices.types';
import type { PaginatedResult, PaginatedData } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'queries-service']);

/**
 * Transform database invoice to response format
 */
export const transformInvoiceResponse = (invoice: InvoiceWithRelations): InvoiceResponse => {
  return {
    ...invoice,
    issue_date: invoice.issue_date?.toISOString() || null,
    due_date: invoice.due_date?.toISOString() || null,
    paid_at: invoice.paid_at?.toISOString() || null,
    created_at: invoice.created_at.toISOString(),
    updated_at: invoice.updated_at.toISOString(),
    line_items: invoice.lineItems?.map((li: SelectInvoiceLineItem) => ({
      ...li,
      created_at: li.created_at.toISOString(),
      updated_at: li.updated_at.toISOString(),
    })),
  } satisfies InvoiceResponse;
};

/**
 * List invoices
 */
const listInvoices = async (
  { filters }: { filters: ListInvoicesQuery },
  ctx: ServiceContext,
): Promise<PaginatedResult<InvoiceResponse, 'invoices'>> => {
  // CASL Check: Basic read check for the organization
  // Fine-grained checks will be added in P2
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Invoice');

  try {
    // Short-circuit: direct lookup when a specific invoice ID is provided
    if (filters.invoice_id) {
      const invoice = await invoicesRepository.findInvoiceById(filters.invoice_id, ctx.organizationId);

      if (!invoice) return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({ invoices: [], total: 0 });

      // Ownership check (already partially handled by findInvoiceById with organizationId)
      return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({ invoices: [transformInvoiceResponse(invoice)], total: 1 });
    }

    const { invoices: list, total } = await invoicesRepository.listInvoicesByOrganization(ctx.organizationId, {
      clientId: filters.client_id,
      matterId: filters.matter_id,
      status: filters.status,
      page: filters.page,
      limit: filters.limit,
    });

    return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({
      invoices: list.map((i) => transformInvoiceResponse(i)),
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list invoices {organizationId}: {error}', {
      organizationId: ctx.organizationId,
      error: message,
    });
    return result.internalError<PaginatedData<InvoiceResponse, 'invoices'>>('Failed to list invoices');
  }
};

export const invoiceQueriesService = {
  listInvoices,
  transformInvoiceResponse,
};
