import { InvoiceUpdated } from '@/shared/events/definitions';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { syncLineItems } from '@/modules/invoices/services/invoice-creation.helpers';
import { calculateInvoiceTotals } from '@/modules/invoices/services/invoice.utils';
import type { InvoiceWithRelations, UpdateInvoiceRequest } from '@/modules/invoices/types/invoices.types';
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
): Promise<InvoiceWithRelations | undefined> => {
  return await ctx.db.transaction(async (tx) => {
    const { line_items, ...invoiceData } = data;
    let totals = {};

    if (line_items) {
      totals = calculateInvoiceTotals(line_items, existing.amount_paid);
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
          changes: Object.fromEntries(
            definedKeys.map((key) => [key, data[key as keyof UpdateInvoiceRequest]])
          ) as Record<string, unknown>,
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
};
