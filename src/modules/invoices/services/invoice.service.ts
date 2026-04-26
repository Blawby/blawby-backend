import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { getClientInvoiceDetail, listClientInvoices } from '@/modules/invoices/services/invoice-client.service';
import {
  persistInvoiceStructure,
  syncLineItems,
  validateInvoiceCreation,
} from '@/modules/invoices/services/invoice-creation.helpers';
import { calculateInvoiceTotals } from '@/modules/invoices/services/invoice.utils';
import type {
  CreateInvoiceRequest,
  InvoiceSummary,
  InvoiceWithRelations,
  ListInvoicesQuery,
  UpdateInvoiceRequest,
} from '@/modules/invoices/types/invoices.types';
import { InvoiceDeleted, InvoiceUpdated } from '@/shared/events/definitions';
import type { PaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'service']);

const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  const { clientId } = await validateInvoiceCreation(data, ctx);

  try {
    const invoice = await persistInvoiceStructure({ data, clientId }, ctx);
    if (!invoice) {
      throw new Error('Failed to retrieve created invoice');
    }

    return invoice;
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof HTTPException) {
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
    throw new Error('Failed to list invoices');
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
    throw new Error('Failed to get invoice');
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
      throw new HTTPException(400, { message: 'Only draft invoices can be modified (except status updates)' });
    }

    if (existing.status !== 'draft') {
      const isStatusOnlyUpdate = definedKeys.length === 1 && definedKeys[0] === 'status';
      if (!isStatusOnlyUpdate) {
        throw new HTTPException(400, { message: 'Only draft invoices can be modified (except status updates)' });
      }
    }

    const updated = await ctx.db.transaction(async (tx) => {
      const { line_items, ...invoiceData } = data;
      let totals = {};

      if (line_items) {
        totals = calculateInvoiceTotals(line_items);
        await syncLineItems({ invoiceId: id, lineItems: line_items }, tx);
      }

      await invoicesRepository.updateInvoice(
        id,
        ctx.organizationId,
        {
          ...invoiceData,
          ...totals,
          due_date: data.due_date ? new Date(data.due_date) : undefined,
        },
        tx
      );

      const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId, tx);
      if (invoice) {
        await InvoiceUpdated.dispatch(
          {
            invoice_id: id,
            organization_id: ctx.organizationId,
            changes: data,
          },
          {
            actorId: ctx.userId,
            actorType: 'user',
            organizationId: ctx.organizationId,
            tx,
          }
        );
      }

      return invoice;
    });

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
    throw new Error('Failed to update invoice');
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

    const executor = ctx.db;
    await invoicesRepository.softDeleteInvoice(id, ctx.organizationId, ctx.userId, executor);
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
        tx: executor,
      }
    );

    return { success: true };
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to delete invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to delete invoice');
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
