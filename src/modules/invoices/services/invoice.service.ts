import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { getClientInvoiceDetail, listClientInvoices } from '@/modules/invoices/services/invoice-client.service';
import { persistInvoiceStructure, validateInvoiceCreation } from '@/modules/invoices/services/invoice-creation.helpers';
import { persistInvoiceUpdate } from '@/modules/invoices/services/invoice-lifecycle.helpers';
import type {
  CreateInvoiceRequest,
  InvoiceSummary,
  InvoiceWithRelations,
  ListInvoicesQuery,
  UpdateInvoiceRequest,
} from '@/modules/invoices/types/invoices.types';
import { InvoiceDeleted } from '@/shared/events/definitions';
import type { PaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'service']);

const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  try {
    const { clientId } = await validateInvoiceCreation(data, ctx);
    const invoice = await persistInvoiceStructure({ data, clientId }, ctx);
    if (!invoice) {
      throw new Error('Failed to retrieve created invoice');
    }

    return invoice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to create invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('An error occurred while creating the invoice', { cause: error });
  }
};

const listInvoices = async (
  { filters }: { filters: ListInvoicesQuery },
  ctx: ServiceContext
): Promise<PaginatedResponse<InvoiceSummary>> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Invoice');

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
      data: list,
      pagination: { page, limit, total },
    };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to list invoices: {error}', {
      organizationId: ctx.organizationId,
      filters,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to list invoices', { cause: error });
  }
};

const getInvoiceById = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('read', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    return invoice;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to get invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to get invoice', { cause: error });
  }
};

const updateInvoice = async (
  { id, data }: { id: string; data: UpdateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const existing = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!existing) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    const definedKeys = Object.keys(data).filter((key) => data[key as keyof UpdateInvoiceRequest] !== undefined);
    if (definedKeys.length === 0) {
      throw new HTTPException(400, { message: 'Request must include at least one field to update' });
    }

    if (existing.status !== 'draft') {
      const isStatusOnlyUpdate = definedKeys.length === 1 && definedKeys[0] === 'status';
      if (!isStatusOnlyUpdate) {
        throw new HTTPException(400, { message: 'Only draft invoices can be modified (except status updates)' });
      }
    }

    const updated = await persistInvoiceUpdate({ id, data, existing, definedKeys }, ctx);

    if (!updated) {
      throw new Error('Failed to retrieve updated invoice');
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to update invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to update invoice', { cause: error });
  }
};

const deleteInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<{ success: true }> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Invoice');

  try {
    const existing = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!existing) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    if (existing.status !== 'draft') {
      throw new HTTPException(400, { message: 'Only draft invoices can be deleted' });
    }

    await ctx.db.transaction(async (tx) => {
      await invoicesRepository.softDeleteInvoice(id, ctx.organizationId, ctx.userId, tx);
      await InvoiceDeleted.dispatch(
        {
          invoice_id: id,
          organization_id: ctx.organizationId,
          deleted_by: 'user',
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
          tx,
        }
      );
    });

    return { success: true };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to delete invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to delete invoice', { cause: error });
  }
};

export const invoiceService = {
  createInvoice,
  listInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  listClientInvoices,
  getClientInvoiceDetail,
} as const;
