import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { calculateInvoiceTotals } from '@/modules/invoices/services/invoice.utils';
import type {
  CreateInvoiceRequest,
  InvoiceLineItemInput,
  InvoiceWithRelations,
} from '@/modules/invoices/types/invoices.types';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { uow } from '@/shared/database/uow';
import { InvoiceCreated } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { HTTPException } from 'hono/http-exception';

const assertUnreachable = (value: never): never => {
  throw new Error(`Unhandled invoiceType: ${String(value)}`);
};

const getFundDestination = (invoiceType: 'flat_fee' | 'phase_fee' | 'retainer_deposit'): 'operating' | 'trust' => {
  switch (invoiceType) {
    case 'retainer_deposit':
      return 'trust';
    case 'flat_fee':
    case 'phase_fee':
      return 'operating';
    default:
      return assertUnreachable(invoiceType);
  }
};

const mapToLineItemRows = (invoiceId: string, lineItems: InvoiceLineItemInput[]) =>
  lineItems.map((item, index) => ({
    ...item,
    invoice_id: invoiceId,
    line_total: item.quantity * item.unit_price,
    sort_order: item.sort_order ?? index,
  }));

const verifyTimeEntries = async (timeEntryIds: string[], matterId: string): Promise<void> => {
  const matchingCount = await matterTimeEntriesQueries.countByIds(matterId, timeEntryIds);
  if (matchingCount !== timeEntryIds.length) {
    throw new HTTPException(400, {
      message: 'One or more time_entry_ids do not belong to the provided matter_id',
    });
  }
};

const verifyExpenses = async (expenseIds: string[], matterId: string): Promise<void> => {
  const matchingCount = await matterExpensesQueries.countByIds(matterId, expenseIds);
  if (matchingCount !== expenseIds.length) {
    throw new HTTPException(400, {
      message: 'One or more expense_ids do not belong to the provided matter_id',
    });
  }
};

const verifyMilestone = async (milestoneId: string, matterId: string): Promise<void> => {
  const milestone = await matterMilestonesQueries.findMatterMilestoneById(milestoneId);
  if (!milestone || milestone.matter_id !== matterId) {
    throw new HTTPException(400, { message: 'milestone_id does not belong to the provided matter_id' });
  }
};

export const syncLineItems = async ({
  invoiceId,
  lineItems,
}: {
  invoiceId: string;
  lineItems: InvoiceLineItemInput[];
}): Promise<void> => {
  await uow.transaction(async () => {
    await invoicesRepository.deleteInvoiceLineItems(invoiceId);
    await invoicesRepository.createInvoiceLineItems(mapToLineItemRows(invoiceId, lineItems));
  });
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
    const matter = matters.find((m) => m.id === data.matter_id);
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
    const checks: Promise<void>[] = [];
    if (data.time_entry_ids?.length) {
      checks.push(verifyTimeEntries(data.time_entry_ids, data.matter_id));
    }
    if (data.expense_ids?.length) {
      checks.push(verifyExpenses(data.expense_ids, data.matter_id));
    }
    if (data.milestone_id) {
      checks.push(verifyMilestone(data.milestone_id, data.matter_id));
    }
    await Promise.all(checks);
  }

  await invoiceValidators.validateInvoiceNumberUnique(ctx.organizationId, data.invoice_number);

  return { clientId };
};

export const persistInvoiceStructure = async (
  { data, clientId }: { data: CreateInvoiceRequest; clientId: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> =>
  await uow.transaction(async () => {
    const { line_items, time_entry_ids, expense_ids, milestone_id, ...invoiceData } = data;
    const matterId = data.matter_id;
    const { invoice_type } = data;
    const fund_destination = getFundDestination(invoice_type);
    const totals = calculateInvoiceTotals(data.line_items);

    let newInvoice = undefined;
    try {
      newInvoice = await invoicesRepository.createInvoice({
        ...invoiceData,
        organization_id: ctx.organizationId,
        client_id: clientId,
        invoice_type,
        fund_destination,
        ...totals,
        status: 'draft',
        issue_date: new Date(),
        due_date: data.due_date ? new Date(data.due_date) : undefined,
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
      if (code === '23505') {
        throw new HTTPException(409, { message: `Invoice number '${data.invoice_number}' already exists` });
      }
      throw error;
    }

    await invoicesRepository.createInvoiceLineItems(mapToLineItemRows(newInvoice.id, line_items));

    if (matterId && time_entry_ids?.length) {
      await matterTimeEntriesQueries.markAsInvoiced(time_entry_ids, newInvoice.id, matterId);
    }
    if (matterId && expense_ids?.length) {
      await matterExpensesQueries.markAsInvoiced(expense_ids, newInvoice.id, matterId);
    }
    if (matterId && milestone_id) {
      await matterMilestonesQueries.markAsInvoiced(milestone_id, newInvoice.id, matterId);
    }

    const invoice = await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId);
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
        }
      );
    }

    return invoice;
  });
