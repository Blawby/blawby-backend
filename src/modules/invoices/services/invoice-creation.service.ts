import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
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
  const subtotal = lineItems.reduce((acc, item) => acc + (item.quantity * item.unit_price), 0);
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
  ctx: ServiceContext,
): Promise<Result<{ clientId: string }>> => {
  // 1. Resolve and validate client with all required relations
  const clientResult = await invoiceClientResolver.resolveClientForInvoice(
    ctx.organizationId,
    data.client_id,
    data.connected_account_id,
  );
  if (!clientResult.success) return clientResult;

  const { id: clientId, connectedAccount, matters } = clientResult.data;

  // 2. Validate connected account capabilities
  const accountValidation = invoiceValidators.validateConnectedAccount(connectedAccount);
  if (!accountValidation.success) return accountValidation;

  // 3. Validate matter belongs to client (if provided)
  if (data.matter_id) {
    const matter = matters.find((m) => m.id === data.matter_id);
    const matterValidation = invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (!matterValidation.success) return matterValidation;
  }

  // 4. Validate invoice number is unique
  const numberValidation = await invoiceValidators.validateInvoiceNumberUnique(
    ctx.organizationId,
    data.invoice_number,
  );
  if (!numberValidation.success) return numberValidation;

  return result.ok<{ clientId: string }>({ clientId });
};

/**
 * Internal helper to persist the invoice structure (SRP)
 */
const persistInvoiceStructure = async (
  { data, clientId, totals }: { data: CreateInvoiceRequest; clientId: string; totals: InvoiceTotals },
  ctx: ServiceContext,
): Promise<InvoiceWithRelations | undefined> => {
  return await db.transaction(async (tx) => {
    const { line_items, ...invoiceData } = data;
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
      tx,
    );

    await invoicesRepository.createInvoiceLineItems(
      line_items.map((item, index) => ({
        ...item,
        type: item.type,
        invoice_id: newInvoice.id,
        line_total: item.quantity * item.unit_price,
        sort_order: item.sort_order ?? index,
      })),
      tx,
    );

    const invWithRel = await invoicesRepository.findInvoiceById(newInvoice.id, ctx.organizationId, tx);
    if (invWithRel) {
      await InvoiceCreated.dispatch(
        {
          invoice_id: newInvoice.id,
          organization_id: ctx.organizationId,
          client_id: clientId,
          matter_id: data.matter_id || null,
          invoice_number: newInvoice.invoice_number,
          total: totals.total,
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
          tx,
        },
      );
    }

    return invWithRel;
  });
};

/**
 * Create an invoice
 */
const createInvoice = async (
  { data }: { data: CreateInvoiceRequest },
  ctx: ServiceContext,
): Promise<Result<InvoiceResponse>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('create', 'Invoice');

  // 1. Validate State
  const validation = await validateInvoiceCreation(data, ctx);
  if (!validation.success) return validation;

  const { clientId } = validation.data;
  const totals = calculateInvoiceTotals(data.line_items);

  try {
    // 2. Persist
    const invoice = await persistInvoiceStructure({ data, clientId, totals }, ctx);
    if (!invoice) return result.internalError<InvoiceResponse>('Failed to retrieve created invoice');

    return result.ok<InvoiceResponse>(invoiceQueriesService.transformInvoiceResponse(invoice));
  } catch (error) {
    return handleServiceError(error, logger, { organizationId: ctx.organizationId, userId: ctx.userId }, 'Failed to create invoice');
  }
};

export const invoiceCreationService = {
  createInvoice,
};
