import { ForbiddenError } from '@casl/ability';
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
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import type { ServiceContext } from '@/shared/types/service-context';
import { createAppError, createValidationError, createTransactionError } from '@/shared/types/errors';

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
): Promise<{ clientId: string }> => {
  // 1. Resolve and validate client with all required relations
  const client = await invoiceClientResolver.resolveClientForInvoice(
    ctx.organizationId,
    data.client_id,
    data.connected_account_id
  );

  const { id: clientId, connectedAccount, matters } = client;

  // 2. Validate connected account capabilities
  const accountValidation = invoiceValidators.validateConnectedAccount(connectedAccount);
  if (!accountValidation.success) {
    throw createValidationError('INVALID_CONNECTED_ACCOUNT', 'Invalid connected account', {
      connectedAccountId: data.connected_account_id,
    });
  }

  // 3. Validate matter belongs to client (if provided)
  if (data.matter_id) {
    const matter = matters.find((m: { id: string }) => m.id === data.matter_id);
    const matterValidation = invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (!matterValidation.success) {
      throw createValidationError('MATTER_NOT_FOR_CLIENT', 'Invalid matter for client', {
        matterId: data.matter_id,
        clientId,
      });
    }
    if (matter?.billing_type === 'pro_bono') {
      throw createValidationError('PRO_BONO_MATTER', 'Cannot create invoice for a pro bono matter', {
        matterId: data.matter_id,
      });
    }
  }

  // 3.5 Validate invoice-linked IDs are scoped to the same matter
  if ((data.time_entry_ids?.length || data.expense_ids?.length || data.milestone_id) && !data.matter_id) {
    throw createValidationError(
      'MATTER_ID_REQUIRED',
      'matter_id is required when linking time entries, expenses, or milestones',
      {
        hasTimeEntries: data.time_entry_ids?.length ?? 0,
        hasExpenses: data.expense_ids?.length ?? 0,
        hasMilestone: Boolean(data.milestone_id),
      }
    );
  }

  if (data.matter_id) {
    if (data.time_entry_ids?.length) {
      const matterTimeEntries = await matterTimeEntriesQueries.listMatterTimeEntries(data.matter_id);
      const validTimeEntryIds = new Set(matterTimeEntries.map((entry) => entry.id));
      const hasInvalidTimeEntry = data.time_entry_ids.some((id) => !validTimeEntryIds.has(id));
      if (hasInvalidTimeEntry) {
        throw createValidationError(
          'INVALID_TIME_ENTRY_IDS',
          'One or more time_entry_ids do not belong to the provided matter_id',
          { matterId: data.matter_id, timeEntryCount: data.time_entry_ids.length }
        );
      }
    }

    if (data.expense_ids?.length) {
      const matterExpenses = await matterExpensesQueries.listMatterExpenses(data.matter_id);
      const validExpenseIds = new Set(matterExpenses.map((expense) => expense.id));
      const hasInvalidExpense = data.expense_ids.some((id) => !validExpenseIds.has(id));
      if (hasInvalidExpense) {
        throw createValidationError(
          'INVALID_EXPENSE_IDS',
          'One or more expense_ids do not belong to the provided matter_id',
          { matterId: data.matter_id, expenseCount: data.expense_ids.length }
        );
      }
    }

    if (data.milestone_id) {
      const milestone = await matterMilestonesQueries.findMatterMilestoneById(data.milestone_id);
      if (!milestone || milestone.matter_id !== data.matter_id) {
        throw createValidationError('INVALID_MILESTONE_ID', 'milestone_id does not belong to the provided matter_id', {
          matterId: data.matter_id,
          milestoneId: data.milestone_id,
        });
      }
    }
  }

  // 4. Validate invoice number is unique
  const numberValidation = await invoiceValidators.validateInvoiceNumberUnique(ctx.organizationId, data.invoice_number);
  if (!numberValidation.success) {
    throw createValidationError('DUPLICATE_INVOICE_NUMBER', 'Invoice number must be unique', {
      invoiceNumber: data.invoice_number,
      organizationId: ctx.organizationId,
    });
  }

  return { clientId };
};

/**
 * Internal helper to persist the invoice structure (SRP)
 */
const persistInvoiceStructure = async (
  { data, clientId, totals }: { data: CreateInvoiceRequest; clientId: string; totals: InvoiceTotals },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> => {
  const executor = ctx.db;
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

  const invWithRel = await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId, executor);
  // Note: event dispatching moved to handler to ensure a single TX owner
  // Service will simply return the created invoice with relations.

  return invWithRel;
};

/**
 * Create Invoice Service
 *
 * Orchestrates invoice creation:
 * 1. Validates client, matter, and invoice data
 * 2. Calculates totals
 * 3. Persists invoice structure
 * 4. Returns invoice with relations
 */
const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext
): Promise<InvoiceResponse> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  // 1. Validate State
  const validation = await validateInvoiceCreation(data, ctx);
  if (!validation.clientId) {
    throw createValidationError('INVALID_INVOICE_CREATION', 'Invalid invoice creation data', {
      organizationId: ctx.organizationId,
    });
  }

  const { clientId } = validation;
  const totals = calculateInvoiceTotals(data.line_items);

  try {
    // 2. Persist
    const invoice = await persistInvoiceStructure({ data, clientId, totals }, ctx);
    if (!invoice) {
      throw createAppError('INVOICE_RETRIEVAL_FAILED', 'Failed to retrieve created invoice', 400, {
        organizationId: ctx.organizationId,
      });
    }

    return invoiceQueriesService.transformInvoiceResponse(invoice);
  } catch (error) {
    // Re-throw AppErrors and ValidationErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }
    // Wrap unexpected errors
    throw createTransactionError('INVOICE_CREATION_FAILED', 'An error occurred while creating the invoice', {
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

export const invoiceCreationService = {
  createInvoice,
};
