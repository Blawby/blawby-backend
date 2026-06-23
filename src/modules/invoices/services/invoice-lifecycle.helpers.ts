import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { syncLineItems } from '@/modules/invoices/services/invoice-creation.helpers';
import { calculateInvoiceTotals } from '@/modules/invoices/services/invoice.utils';
import type { InvoiceWithRelations, UpdateInvoiceRequest } from '@/modules/invoices/types/invoices.types';
import { uow } from '@/shared/database/uow';
import { InvoiceUpdated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

export const persistInvoiceUpdate = async (
  {
    id,
    data,
    existing,
    definedKeys,
  }: {
    id: string;
    data: UpdateInvoiceRequest;
    existing: InvoiceWithRelations;
    definedKeys: string[];
  },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> =>
  await uow.transaction(async () => {
    const { line_items, due_date: _dueDate, ...invoiceData } = data;
    let totals = {};
    let resolvedDueDate: Date | null = null;
    if (data.due_date === null) {
      resolvedDueDate = null;
    } else if (data.due_date) {
      resolvedDueDate = new Date(data.due_date);
    }
    const dueDateUpdate = 'due_date' in data ? { due_date: resolvedDueDate } : {};

    if (line_items?.length) {
      totals = calculateInvoiceTotals(line_items, existing.amount_paid);
      await syncLineItems({ invoiceId: id, lineItems: line_items });
    }

    await invoicesRepository.updateInvoice(id, ctx.organizationId, {
      ...invoiceData,
      ...totals,
      ...dueDateUpdate,
    });

    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (invoice) {
      await InvoiceUpdated.dispatch(
        {
          invoice_id: id,
          organization_id: ctx.organizationId,
          changes: Object.fromEntries(
            definedKeys.map((key) => [key, data[key as keyof UpdateInvoiceRequest]])
          ) as Record<string, unknown>,
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
        }
      );
    }

    return invoice;
  });
