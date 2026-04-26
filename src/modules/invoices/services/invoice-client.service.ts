import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import type { InvoiceSummary, InvoiceWithRelations, ListInvoicesQuery } from '@/modules/invoices/types/invoices.types';
import { toSubject } from '@/shared/auth/subject-helpers';
import type { PaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'client-service']);

export const listClientInvoices = async (
  { filters }: { filters: { status?: ListInvoicesQuery['status']; page?: number; limit?: number } },
  ctx: ServiceContext
): Promise<PaginatedResponse<InvoiceSummary>> => {
  if (!ctx.userId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Invoice', { client_user_id: ctx.userId }));

  try {
    const userDetailId = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { invoices: list, total } = await invoicesRepository.findManyByClientId(ctx.organizationId, userDetailId, {
      status: filters.status,
      page,
      limit,
    });

    return {
      data: list,
      pagination: { page, limit, total },
    };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to list client invoices for user {userId}: {error}', {
      userId: ctx.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to list client invoices', { cause: error });
  }
};

export const getClientInvoiceDetail = async (
  { invoiceId }: { invoiceId: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  if (!ctx.userId) {
    throw new HTTPException(401, { message: 'Authentication required' });
  }

  ForbiddenError.from(ctx.ability).throwUnlessCan('read', toSubject('Invoice', { client_user_id: ctx.userId }));

  try {
    const userDetailId = await invoiceClientResolver.resolveUserDetailId(ctx.organizationId, ctx.userId);
    const invoice = await invoicesRepository.findOneByIdAndClientId(ctx.organizationId, invoiceId, userDetailId);
    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    return invoice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get client invoice {invoiceId}: {error}', {
      invoiceId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to get client invoice', { cause: error });
  }
};
