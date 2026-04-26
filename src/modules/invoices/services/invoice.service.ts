import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
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
  InvoiceSummary,
  InvoiceWithRelations,
  ListInvoicesQuery,
  UpdateInvoiceRequest,
} from '@/modules/invoices/types/invoices.types';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import { toSubject } from '@/shared/auth/subject-helpers';
import { InvoiceDeleted, InvoiceUpdated } from '@/shared/events/definitions';
import type { PaginatedResponse } from '@/shared/types/pagination';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'service']);

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

const validateInvoiceCreation = async (
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

const persistInvoiceStructure = async (
  { data, clientId }: { data: CreateInvoiceRequest; clientId: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> => {
  const executor = ctx.db;
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
    executor
  );

  await invoicesRepository.createInvoiceLineItems(
    line_items.map((item, index) => ({
      ...item,
      type: item.type,
      invoice_id: newInvoice.id,
      line_total: item.quantity * item.unit_price,
      sort_order: item.sort_order ?? index,
    })),
    executor
  );

  if (matterId && time_entry_ids?.length) {
    await matterTimeEntriesQueries.markAsInvoiced(time_entry_ids, newInvoice.id, matterId, executor);
  }
  if (matterId && expense_ids?.length) {
    await matterExpensesQueries.markAsInvoiced(expense_ids, newInvoice.id, matterId, executor);
  }
  if (matterId && milestone_id) {
    await matterMilestonesQueries.markAsInvoiced(milestone_id, newInvoice.id, matterId, executor);
  }

  return await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId, executor);
};

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

    if (existing.status !== 'draft') {
      const updateKeys = Object.keys(data);
      const isStatusOnlyUpdate = updateKeys.length === 1 && updateKeys[0] === 'status';
      if (!isStatusOnlyUpdate) {
        throw new HTTPException(400, { message: 'Only draft invoices can be modified (except status updates)' });
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

const listClientInvoices = async (
  { filters }: { filters: { status?: string; page?: number; limit?: number } },
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
    throw new Error('Failed to list client invoices');
  }
};

const getClientInvoiceDetail = async (
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
    throw new Error('Failed to get client invoice');
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
