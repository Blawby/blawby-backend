import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import type {
  ListInvoicesQuery,
  InvoiceResponse,
  InvoiceWithRelations,
  InvoiceSummary,
} from '@/modules/invoices/types/invoices.types';
import { toSubject } from '@/shared/auth/subject-helpers';
import type { PaginatedResult, PaginatedData, Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'queries-service']);

type InvoiceLineItemType = NonNullable<InvoiceResponse['line_items']>[number]['type'];

const isInvoiceLineItemType = (value: string): value is InvoiceLineItemType =>
  value === 'service' ||
  value === 'time_entry' ||
  value === 'expense' ||
  value === 'flat_fee' ||
  value === 'retainer' ||
  value === 'other';

/**
 * Transform a full invoice (with line items) to response format
 */
const transformInvoiceResponse = (invoice: InvoiceWithRelations): InvoiceResponse => {
  const { lineItems, ...rest } = invoice;
  const line_items = lineItems.map((lineItem) => ({
    ...lineItem,
    type: isInvoiceLineItemType(lineItem.type) ? lineItem.type : 'other',
  }));

  return {
    ...rest,
    client: rest.client
      ? {
          id: rest.client.id,
          name: rest.client.name ?? '',
          email: rest.client.email ?? '',
          status: rest.client.status,
        }
      : undefined,
    line_items,
  };
};

/**
 * Transform a summary invoice (no line items) to response format
 */
const transformSummaryResponse = (invoice: InvoiceSummary): InvoiceResponse => ({
  ...invoice,
  client: invoice.client
    ? {
        id: invoice.client.id,
        name: invoice.client.name ?? '',
        email: invoice.client.email ?? '',
        status: invoice.client.status,
      }
    : undefined,
});

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
    if (!ctx.userId) {
      return result.unauthorized('Authentication required');
    }

    if (ctx.ability.cannot('read', toSubject('Invoice', { client_user_id: ctx.userId }))) {
      return result.forbidden('You do not have permission to view invoices');
    }

    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) {
      return userDetailResult;
    }

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
 * Get a single invoice by ID (practice admin/member view)
 */
const getInvoiceById = async ({ id }: { id: string }, ctx: ServiceContext): Promise<Result<InvoiceResponse>> => {
  try {
    if (ctx.ability.cannot('read', 'Invoice')) {
      return result.forbidden<InvoiceResponse>('You do not have permission to view this invoice');
    }

    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      return result.notFound('Invoice not found');
    }

    return result.ok(transformInvoiceResponse(invoice));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: message,
    });
    return result.internalError('Failed to get invoice');
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
    if (!ctx.userId) {
      return result.unauthorized('Authentication required');
    }

    if (ctx.ability.cannot('read', toSubject('Invoice', { client_user_id: ctx.userId }))) {
      return result.forbidden('You do not have permission to view this invoice');
    }

    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) {
      return userDetailResult;
    }

    const invoice = await invoicesRepository.findOneByIdAndClientId(
      ctx.organizationId,
      invoiceId,
      userDetailResult.data
    );
    if (!invoice) {
      return result.notFound('Invoice not found');
    }

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
  getInvoiceById,
  listClientInvoices,
  getClientInvoiceDetail,
  transformInvoiceResponse,
  transformSummaryResponse,
};
