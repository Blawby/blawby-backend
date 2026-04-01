import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import type {
  UpdateInvoiceRequest,
  InvoiceResponse,
  InvoiceTotals,
  InvoiceLineItemInput,
} from '@/modules/invoices/types/invoices.types';
// Db executor is provided via ServiceContext (ctx.db)
import { InvoiceUpdated, InvoiceDeleted } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { createAppError, createValidationError, createTransactionError } from '@/shared/types/errors';

const logger = getLogger(['invoices', 'lifecycle-service']);

/**
 * Internal helper to manage line item persistence (SRP)
 */
const syncLineItems = async (
  {
    invoiceId,
    lineItems,
  }: {
    invoiceId: string;
    lineItems: InvoiceLineItemInput[];
  },
  executor: ServiceContext['db']
): Promise<void> => {
  await invoicesRepository.deleteInvoiceLineItems(invoiceId, executor);
  await invoicesRepository.createInvoiceLineItems(
    lineItems.map((item, index) => ({
      ...item,
      type: item.type,
      invoice_id: invoiceId,
      line_total: item.quantity * item.unit_price,
      sort_order: item.sort_order ?? index,
    })),
    executor
  );
};

/**
 * Calculate invoice subtotal and total based on line items (Shared utility)
 */
const calculateInvoiceTotals = (lineItems: InvoiceLineItemInput[]): InvoiceTotals => {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const tax_amount = 0;
  const discount_amount = 0;
  const total = subtotal + tax_amount - discount_amount;

  return {
    subtotal,
    tax_amount,
    discount_amount,
    total,
    amount_due: total,
  };
};

/**
 * Update a draft invoice
 */
const updateInvoice = async (
  { id, data }: { id: string; data: UpdateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceResponse> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const existing = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!existing) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    // Only allow updating non-draft invoices if updating status ONLY
    if (existing.status !== 'draft') {
      const updateKeys = Object.keys(data);
      const isStatusOnlyUpdate = updateKeys.length === 1 && updateKeys[0] === 'status';

      if (!isStatusOnlyUpdate) {
        throw createValidationError(
          'INVOICE_NOT_DRAFT',
          'Only draft invoices can be modified (except status updates)',
          {
            invoiceId: id,
            currentStatus: existing.status,
          }
        );
      }
    }

    const { line_items, ...invoiceData } = data;

    const executor = ctx.db;
    let totals = {};
    if (line_items) {
      totals = calculateInvoiceTotals(line_items);
      await syncLineItems({ invoiceId: id, lineItems: line_items }, executor);
    }

    await invoicesRepository.updateInvoice(
      id,
      ctx.organizationId,
      {
        ...invoiceData,
        ...totals,
        due_date: data.due_date ? new Date(data.due_date) : undefined,
      },
      executor
    );

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId, executor);
    if (updated) {
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
          tx: executor,
        }
      );
    }

    if (!updated) {
      throw createAppError('INVOICE_RETRIEVAL_FAILED', 'Failed to retrieve updated invoice', 500, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    return invoiceQueriesService.transformInvoiceResponse(updated);
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: message,
    });
    throw createTransactionError(
      'INVOICE_UPDATE_FAILED',
      'Failed to update invoice',
      {
        invoiceId: id,
        organizationId: ctx.organizationId,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
};

/**
 * Soft delete an invoice
 */
const deleteInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<{ success: true }> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('delete', 'Invoice');

  try {
    const existing = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!existing) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    if (existing.status !== 'draft') {
      throw createValidationError('INVOICE_NOT_DRAFT', 'Only draft invoices can be deleted', {
        invoiceId: id,
        currentStatus: existing.status,
      });
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
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete invoice {invoiceId}: {error}', {
      invoiceId: id,
      error: message,
    });
    throw createTransactionError(
      'INVOICE_DELETE_FAILED',
      'Failed to delete invoice',
      {
        invoiceId: id,
        organizationId: ctx.organizationId,
        cause: error instanceof Error ? error.message : String(error),
      }
    );
  }
};

export const invoiceLifecycleService = {
  updateInvoice,
  deleteInvoice,
};
