import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import type {
  ListInvoicesQuery,
  InvoiceResponse,
  InvoiceWithRelations,
  InvoiceSummary,
} from '@/modules/invoices/types/invoices.types';
import type { PaginatedResult, PaginatedData, Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'queries-service']);

/**
 * Transform a full invoice (with line items) to response format
 */
export const transformInvoiceResponse = (invoice: InvoiceWithRelations): InvoiceResponse => {
  const { lineItems, ...rest } = invoice;
  return {
    ...rest,
    line_items: lineItems,
  } as InvoiceResponse;
};

/**
 * Transform a summary invoice (no line items) to response format
 */
const transformSummaryResponse = (invoice: InvoiceSummary): InvoiceResponse => {
  return invoice as unknown as InvoiceResponse;
};

/**
 * List invoices for a practice (admin/member view)
 */
const listInvoices = async (
  { filters }: { filters: ListInvoicesQuery },
  ctx: ServiceContext
): Promise<PaginatedResult<InvoiceResponse, 'invoices'>> => {
  if (ctx.ability.cannot('read', 'Invoice')) {
    return result.forbidden<PaginatedData<InvoiceResponse, 'invoices'>>('You do not have permission to view invoices');
  }

  try {
    if (filters.invoice_id) {
      const invoice = await invoicesRepository.findInvoiceById(filters.invoice_id, ctx.organizationId);

      if (!invoice) return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({ invoices: [], total: 0 });

      return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({
        invoices: [transformInvoiceResponse(invoice)],
        total: 1,
      });
    }

    const { invoices: list, total } = await invoicesRepository.listInvoicesByOrganization(ctx.organizationId, {
      client_id: filters.client_id,
      matter_id: filters.matter_id,
      status: filters.status,
      page: filters.page,
      limit: filters.limit,
    });

    return result.ok<PaginatedData<InvoiceResponse, 'invoices'>>({
      invoices: list.map(transformSummaryResponse),
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

/**
 * List invoices for the authenticated client (client-facing, no line items)
 */
const listClientInvoices = async (
  { filters }: { filters: { status?: string; page?: number; limit?: number } },
  ctx: ServiceContext
): Promise<Result<{ invoices: InvoiceResponse[]; pagination: { page: number; limit: number; total: number } }>> => {
  try {
    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) return userDetailResult;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const { invoices: list, total } = await invoicesRepository.findManyByClientId(
      ctx.organizationId,
      userDetailResult.data,
      { status: filters.status, page, limit }
    );

    return result.ok({
      invoices: list.map(transformSummaryResponse),
      pagination: { page, limit, total },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list client invoices {userId}: {error}', {
      userId: ctx.userId,
      error: message,
    });
    return result.internalError('Failed to list client invoices');
  }
};

/**
 * Get a single invoice for the authenticated client (client-facing, with line items)
 */
const getClientInvoiceDetail = async (
  { invoiceId }: { invoiceId: string },
  ctx: ServiceContext
): Promise<Result<InvoiceResponse>> => {
  try {
    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) return userDetailResult;

    const invoice = await invoicesRepository.findOneByIdAndClientId(
      ctx.organizationId,
      invoiceId,
      userDetailResult.data
    );
    if (!invoice) return result.notFound('Invoice not found');

    return result.ok(transformInvoiceResponse(invoice));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get client invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError('Failed to get client invoice');
  }
};

export const invoiceQueriesService = {
  listInvoices,
  listClientInvoices,
  getClientInvoiceDetail,
  transformInvoiceResponse,
};
