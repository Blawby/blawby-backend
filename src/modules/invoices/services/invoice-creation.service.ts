import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { matterExpensesQueries } from '@/modules/matters/database/queries/matter-expenses.queries';
import { matterMilestonesQueries } from '@/modules/matters/database/queries/matter-milestones.queries';
import { matterTimeEntriesQueries } from '@/modules/matters/database/queries/matter-time-entries.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import type {
  CreateInvoiceRequest,
  InvoiceResponse,
  InvoiceTotals,
  InvoiceLineItemInput,
  InvoiceWithRelations,
} from '@/modules/invoices/types/invoices.types';
import { handleServiceError } from '@/modules/invoices/utils/error-handler';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import { db } from '@/shared/database';
import { InvoiceCreated } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'creation-service']);

/**
 * Calculate invoice subtotal and total based on line items
 */
const calculateInvoiceTotals = (lineItems: InvoiceLineItemInput[]): InvoiceTotals => {
  const subtotal = lineItems.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const tax_amount = 0; // Future: Implement tax logic
  const discount_amount = 0; // Future: Implement discount logic
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
 * Determine fund destination based on invoice type
 */
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

/**
 * Internal helper to validate invoice creation state
 */
const validateInvoiceCreation = async (
  data: CreateInvoiceRequest,
  ctx: ServiceContext
): Promise<Result<{ clientId: string }>> => {
  // 1. Resolve and validate client with all required relations
  // oxlint-disable-next-line init-declarations
  let clientResult: Awaited<ReturnType<typeof invoiceClientResolver.resolveClientForInvoice>>;
  try {
    clientResult = await invoiceClientResolver.resolveClientForInvoice(
      ctx.organizationId,
      data.client_id,
      data.connected_account_id
    );
  } catch (error) {
    return handleServiceError(
      error,
      logger,
      { organizationId: ctx.organizationId, userId: ctx.userId, clientId: data.client_id },
      'Failed to resolve client for invoice creation'
    );
  }

  if (!clientResult.success) {
    return clientResult;
  }

  const { id: clientId, connectedAccount, matters } = clientResult.data;

  // 2. Validate connected account capabilities
  const accountValidation = invoiceValidators.validateConnectedAccount(connectedAccount);
  if (!accountValidation.success) {
    return accountValidation;
  }

  // 3. Validate matter belongs to client (if provided)
  if (data.matter_id) {
    const matter = matters.find((m) => m.id === data.matter_id);
    const matterValidation = invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (!matterValidation.success) {
      return matterValidation;
    }
    if (matter?.billing_type === 'pro_bono') {
      return result.badRequest('Cannot create invoice for a pro bono matter');
    }
  }

  // 3.5 Validate invoice-linked IDs are scoped to the same matter
  if ((data.time_entry_ids?.length || data.expense_ids?.length || data.milestone_id) && !data.matter_id) {
    return result.badRequest('matter_id is required when linking time entries, expenses, or milestones');
  }

  if (data.matter_id) {
    if (data.time_entry_ids?.length) {
      const matterTimeEntries = await matterTimeEntriesQueries.listMatterTimeEntries(data.matter_id);
      const validTimeEntryIds = new Set(matterTimeEntries.map((entry) => entry.id));
      const hasInvalidTimeEntry = data.time_entry_ids.some((id) => !validTimeEntryIds.has(id));
      if (hasInvalidTimeEntry) {
        return result.badRequest('One or more time_entry_ids do not belong to the provided matter_id');
      }
    }

    if (data.expense_ids?.length) {
      const matterExpenses = await matterExpensesQueries.listMatterExpenses(data.matter_id);
      const validExpenseIds = new Set(matterExpenses.map((expense) => expense.id));
      const hasInvalidExpense = data.expense_ids.some((id) => !validExpenseIds.has(id));
      if (hasInvalidExpense) {
        return result.badRequest('One or more expense_ids do not belong to the provided matter_id');
      }
    }

    if (data.milestone_id) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(data.milestone_id);
      if (!milestone || milestone.matter_id !== data.matter_id) {
        return result.badRequest('milestone_id does not belong to the provided matter_id');
      }
    }
  }

  // 4. Validate invoice number is unique
  const numberValidation = await invoiceValidators.validateInvoiceNumberUnique(ctx.organizationId, data.invoice_number);
  if (!numberValidation.success) {
    return numberValidation;
  }

  return result.ok<{ clientId: string }>({ clientId });
};

/**
 * Internal helper to persist the invoice structure (SRP)
 */
const persistInvoiceStructure = async (
  { data, clientId, totals }: { data: CreateInvoiceRequest; clientId: string; totals: InvoiceTotals },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> =>
  await db.transaction(async (tx) => {
    const { line_items, time_entry_ids, expense_ids, milestone_id, ...invoiceData } = data;
    const matterId = data.matter_id;
    const invoice_type = data.invoice_type || 'flat_fee';
    const fund_destination = getFundDestination(invoice_type);

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

    const invWithRel = await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId, tx);
    if (!invWithRel) {
      throw new Error('Created invoice could not be reloaded for event dispatch');
    }

    await InvoiceCreated.dispatch(
      {
        invoice_id: invWithRel.id,
        organization_id: ctx.organizationId,
        client_id: clientId,
        matter_id: data.matter_id ?? null,
        invoice_number: invWithRel.invoice_number,
        total: invWithRel.total,
      },
      {
        actorId: ctx.userId,
        actorType: 'user',
        organizationId: ctx.organizationId,
        tx,
      }
    );

    return invWithRel;
  });

/**
 * Create an invoice
 */
const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext
): Promise<Result<InvoiceResponse>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  // 1. Validate State
  const validation = await validateInvoiceCreation(data, ctx);
  if (!validation.success) {
    return validation;
  }

  const { clientId } = validation.data;
  const totals = calculateInvoiceTotals(data.line_items);

  try {
    // 2. Persist
    const invoice = await persistInvoiceStructure({ data, clientId, totals }, ctx);
    return result.ok<InvoiceResponse>(invoiceQueriesService.transformInvoiceResponse(invoice));
  } catch (error) {
    return handleServiceError(
      error,
      logger,
      { organizationId: ctx.organizationId, userId: ctx.userId },
      'Failed to create invoice'
    );
  }
};

export const invoiceCreationService = {
  createInvoice,
};
