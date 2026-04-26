import { HTTPException } from 'hono/http-exception';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { calculateInvoiceTotals } from '@/modules/invoices/services/invoice.utils';
import type {
  CreateInvoiceRequest,
  InvoiceLineItemInput,
  InvoiceWithRelations,
} from '@/modules/invoices/types/invoices.types';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import { InvoiceCreated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

const getFundDestination = (invoiceType: 'flat_fee' | 'phase_fee' | 'retainer_deposit'): 'operating' | 'trust' => {
  switch (invoiceType) {
    case 'retainer_deposit':
      return 'trust';
    case 'flat_fee':
    case 'phase_fee':
    default:
      return 'operating';
  }
};

export const syncLineItems = async (
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

export const validateInvoiceCreation = async (
  data: CreateInvoiceRequest,
  ctx: ServiceContext
): Promise<{ clientId: string }> => {
  const client = await invoiceClientResolver.resolveClientForInvoice(
    ctx.organizationId,
    data.client_id,
    data.connected_account_id
  );

  const { id: clientId, connectedAccount, matters } = client;

  invoiceValidators.validateConnectedAccount(connectedAccount);

  if (data.matter_id) {
    const matter = matters.find((m: { id: string }) => m.id === data.matter_id);
    invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (matter?.billing_type === 'pro_bono') {
      throw new HTTPException(400, { message: 'Cannot create invoice for a pro bono matter' });
    }
  }

  if ((data.time_entry_ids?.length || data.expense_ids?.length || data.milestone_id) && !data.matter_id) {
    throw new HTTPException(400, {
      message: 'matter_id is required when linking time entries, expenses, or milestones',
    });
  }

  if (data.matter_id) {
    if (data.time_entry_ids?.length) {
      const matterTimeEntries = await matterTimeEntriesQueries.listMatterTimeEntries(data.matter_id);
      const validTimeEntryIds = new Set(matterTimeEntries.map((entry) => entry.id));
      const hasInvalidTimeEntry = data.time_entry_ids.some((id) => !validTimeEntryIds.has(id));
      if (hasInvalidTimeEntry) {
        throw new HTTPException(400, {
          message: 'One or more time_entry_ids do not belong to the provided matter_id',
        });
      }
    }

    if (data.expense_ids?.length) {
      const matterExpenses = await matterExpensesQueries.listMatterExpenses(data.matter_id);
      const validExpenseIds = new Set(matterExpenses.map((expense) => expense.id));
      const hasInvalidExpense = data.expense_ids.some((id) => !validExpenseIds.has(id));
      if (hasInvalidExpense) {
        throw new HTTPException(400, {
          message: 'One or more expense_ids do not belong to the provided matter_id',
        });
      }
    }

    if (data.milestone_id) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(data.milestone_id);
      if (!milestone || milestone.matter_id !== data.matter_id) {
        throw new HTTPException(400, { message: 'milestone_id does not belong to the provided matter_id' });
      }
    }
  }

  await invoiceValidators.validateInvoiceNumberUnique(ctx.organizationId, data.invoice_number);

  return { clientId };
};

export const persistInvoiceStructure = async (
  { data, clientId }: { data: CreateInvoiceRequest; clientId: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> => {
  return await ctx.db.transaction(async (tx) => {
    const { line_items, time_entry_ids, expense_ids, milestone_id, ...invoiceData } = data;
    const matterId = data.matter_id;
    const invoice_type = data.invoice_type || 'flat_fee';
    const fund_destination = getFundDestination(invoice_type);
    const totals = calculateInvoiceTotals(data.line_items);

    const newInvoice = await invoicesRepository.createInvoice(
      {
        organization_id: ctx.organizationId,
        ...invoiceData,
        client_id: clientId,
        invoice_type,
        fund_destination,
        ...totals,
        status: 'draft',
        issue_date: new Date(),
        due_date: data.due_date ? new Date(data.due_date) : undefined,
      },
      tx
    );

    await invoicesRepository.createInvoiceLineItems(
      line_items.map((item, index) => ({
        ...item,
        type: item.type,
        invoice_id: newInvoice.id,
        line_total: item.quantity * item.unit_price,
        sort_order: item.sort_order ?? index,
      })),
      tx
    );

    if (matterId && time_entry_ids?.length) {
      await matterTimeEntriesQueries.markAsInvoiced(time_entry_ids, newInvoice.id, matterId, tx);
    }
    if (matterId && expense_ids?.length) {
      await matterExpensesQueries.markAsInvoiced(expense_ids, newInvoice.id, matterId, tx);
    }
    if (matterId && milestone_id) {
      await matterMilestonesQueries.markAsInvoiced(milestone_id, newInvoice.id, matterId, tx);
    }

    const invoice = await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId, tx);
    if (invoice) {
      await InvoiceCreated.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: ctx.organizationId,
          client_id: invoice.client_id,
          matter_id: invoice.matter_id ?? null,
          invoice_number: invoice.invoice_number ?? null,
          total: invoice.total,
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
