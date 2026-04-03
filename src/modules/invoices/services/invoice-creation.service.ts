import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
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
    throw new HTTPException(400, { message: 'Invalid connected account' });
  }

  // 3. Validate matter belongs to client (if provided)
  if (data.matter_id) {
    const matter = matters.find((m: { id: string }) => m.id === data.matter_id);
    const matterValidation = invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (!matterValidation.success) {
      throw new HTTPException(400, { message: 'Invalid matter for client' });
    }
    if (matter?.billing_type === 'pro_bono') {
      throw new HTTPException(400, { message: 'Cannot create invoice for a pro bono matter' });
    }
  }

  // 3.5 Validate invoice-linked IDs are scoped to the same matter
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

  // 4. Validate invoice number is unique
  const numberValidation = await invoiceValidators.validateInvoiceNumberUnique(ctx.organizationId, data.invoice_number);
  if (!numberValidation.success) {
    throw new HTTPException(400, { message: 'Invoice number must be unique' });
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
    throw new HTTPException(400, { message: 'Invalid invoice creation data' });
  }

  const { clientId } = validation;
  const totals = calculateInvoiceTotals(data.line_items);

  try {
    // 2. Persist
    const invoice = await persistInvoiceStructure({ data, clientId, totals }, ctx);
    if (!invoice) {
      throw new HTTPException(400, { message: 'Failed to retrieve created invoice' });
    }

    return invoiceQueriesService.transformInvoiceResponse(invoice);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new Error('An error occurred while creating the invoice');
  }
};

export const invoiceCreationService = {
  createInvoice,
};
