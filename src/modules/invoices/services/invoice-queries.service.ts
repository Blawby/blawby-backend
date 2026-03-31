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
import type { ServiceContext } from '@/shared/types/service-context';
import type { PaginatedResponse } from '@/shared/types/pagination';
import { createAppError } from '@/shared/types/errors';

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
): Promise<PaginatedResponse<InvoiceResponse>> => {
  if (ctx.ability.cannot('read', 'Invoice')) {
    throw createAppError('INVOICE_LISTING_FORBIDDEN', 403, 'You do not have permission to view invoices');
  }

  try {
    const { invoices: list, total } = await invoicesRepository.listInvoicesByOrganization(ctx.organizationId, {
      client_id: filters.client_id,
      matter_id: filters.matter_id,
      status: filters.status,
      page: filters.page,
      limit: filters.limit,
    });

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    return {
      data: list.map(transformSummaryResponse),
      pagination: {
        page,
        limit,
        total,
      },
    };
  } catch (error) {
    throw createAppError('INVOICE_LISTING_FAILED', 500, 'Failed to list invoices', {
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * List invoices for the authenticated client (client-facing, no line items)
 */
const listClientInvoices = async (
  { filters }: { filters: { status?: string; page?: number; limit?: number } },
  ctx: ServiceContext
): Promise<{ invoices: InvoiceResponse[]; pagination: { page: number; limit: number; total: number } }> => {
  try {
    if (!ctx.userId) {
      throw createAppError('AUTHENTICATION_REQUIRED', 401, 'Authentication required');
    }

    if (ctx.ability.cannot('read', toSubject('Invoice', { client_user_id: ctx.userId }))) {
      throw createAppError('INVOICE_LISTING_FORBIDDEN', 403, 'You do not have permission to view invoices');
    }

    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) {
      throw createAppError('USER_DETAIL_NOT_FOUND', 404, 'User detail not found');
    }

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;

    const { invoices: list, total } = await invoicesRepository.findManyByClientId(
      ctx.organizationId,
      userDetailResult.data,
      { status: filters.status, page, limit }
    );

    return {
      invoices: list.map(transformSummaryResponse),
      pagination: { page, limit, total },
    };
  } catch (error) {
    throw createAppError('INVOICE_LISTING_FAILED', 500, 'Failed to list client invoices', {
      userId: ctx.userId,
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a single invoice by ID (practice admin/member view)
 */
const getInvoiceById = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceResponse> => {
  try {
    if (ctx.ability.cannot('read', 'Invoice')) {
      throw createAppError('INVOICE_VIEW_FORBIDDEN', 403, 'You do not have permission to view this invoice');
    }

    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw createAppError('INVOICE_NOT_FOUND', 404, 'Invoice not found', {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    return transformInvoiceResponse(invoice);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: message,
    });
    throw createAppError('INVOICE_RETRIEVAL_FAILED', 500, 'Failed to get invoice', {
      invoiceId: id,
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get a single invoice for the authenticated client (client-facing, with line items)
 */
const getClientInvoiceDetail = async (
  { invoiceId }: { invoiceId: string },
  ctx: ServiceContext
): Promise<InvoiceResponse> => {
  try {
    if (!ctx.userId) {
      throw createAppError('AUTHENTICATION_REQUIRED', 401, 'Authentication required');
    }

    if (ctx.ability.cannot('read', toSubject('Invoice', { client_user_id: ctx.userId }))) {
      throw createAppError('INVOICE_VIEW_FORBIDDEN', 403, 'You do not have permission to view this invoice');
    }

    const userDetailResult = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    if (!userDetailResult.success) {
      throw createAppError('USER_DETAIL_NOT_FOUND', 404, 'User detail not found');
    }

    const invoice = await invoicesRepository.findOneByIdAndClientId(
      ctx.organizationId,
      invoiceId,
      userDetailResult.data
    );
    if (!invoice) {
      throw createAppError('INVOICE_NOT_FOUND', 404, 'Invoice not found', {
        invoiceId,
        organizationId: ctx.organizationId,
      });
    }

    return transformInvoiceResponse(invoice);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get client invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    throw createAppError('INVOICE_RETRIEVAL_FAILED', 500, 'Failed to get client invoice', {
      invoiceId,
      cause: error instanceof Error ? error.message : 'Unknown error',
    });
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
