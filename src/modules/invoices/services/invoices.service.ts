import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceClientResolver } from '@/modules/invoices/services/invoice-client-resolver.service';
import { stripeInvoicesService } from '@/modules/invoices/services/stripe-invoices.service';
import type {
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  ListInvoicesQuery,
  InvoiceResponse,
  InvoiceWithRelations,
  SelectInvoiceLineItem,
} from '@/modules/invoices/types/invoices.types';
import { handleServiceError } from '@/modules/invoices/utils/error-handler';
import { invoiceValidators } from '@/modules/invoices/validators/invoice-creation.validators';
import { organizationService } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import {
  InvoiceCreated,
  InvoiceUpdated,
  InvoiceSent,
  InvoiceVoided,
  InvoiceDeleted,
} from '@/shared/events/definitions';
import type { User } from '@/shared/types/BetterAuth';
import type { Result, PaginatedResult } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { fromStripeTimestamp } from '@/shared/utils/timestamps';

const logger = getLogger(['invoices', 'service']);

/**
 * Calculate invoice subtotal and total based on line items
 */
const calculateInvoiceTotals = (lineItems: Array<{ quantity: number; unit_price: number }>) => {
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
 * - retainer_deposit → trust (lawyer routes to trust account)
 * - flat_fee, phase_fee → operating (earned upon receipt)
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
 * Transform database invoice to response format
 */
const transformInvoiceResponse = (invoice: InvoiceWithRelations): InvoiceResponse => {
  return {
    ...invoice,
    issue_date: invoice.issue_date ?? null,
    due_date: invoice.due_date ?? null,
    paid_at: invoice.paid_at ?? null,
    created_at: invoice.created_at,
    updated_at: invoice.updated_at,
    line_items: invoice.lineItems?.map((li: SelectInvoiceLineItem) => ({
      ...li,
      created_at: li.created_at,
      updated_at: li.updated_at,
    })),
  } satisfies InvoiceResponse;
};

/**
 * Create an invoice
 */
const createInvoice = async (
  organizationId: string,
  data: CreateInvoiceRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  // 1. Validate organization access
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  // 2. Resolve and validate client with all required relations
  const clientResult = await invoiceClientResolver.resolveClientForInvoice(
    organizationId,
    data.client_id,
    data.connected_account_id,
  );
  if (!clientResult.success) return clientResult;

  const { id: clientId, connectedAccount, matters } = clientResult.data;

  // 3. Validate connected account capabilities
  const accountValidation = invoiceValidators.validateConnectedAccount(connectedAccount);
  if (!accountValidation.success) return accountValidation;

  // 4. Validate matter belongs to client (if provided)
  if (data.matter_id) {
    const matter = matters.find((m) => m.id === data.matter_id);
    const matterValidation = invoiceValidators.validateMatterBelongsToClient(matter, clientId);
    if (!matterValidation.success) return matterValidation;
  }

  // 5. Validate invoice number is unique
  const numberValidation = await invoiceValidators.validateInvoiceNumberUnique(
    organizationId,
    data.invoice_number,
  );
  if (!numberValidation.success) return numberValidation;

  // 6. Create invoice
  const { line_items, ...invoiceData } = data;
  const totals = calculateInvoiceTotals(line_items);

  try {
    const invoice = await db.transaction(async (tx) => {
      // Auto-set fund_destination based on invoice_type
      const invoice_type = data.invoice_type || 'flat_fee';
      const fund_destination = getFundDestination(invoice_type);

      const newInvoice = await invoicesRepository.createInvoice(
        {
          organization_id: organizationId,
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
          invoice_id: newInvoice.id,
          line_total: item.quantity * item.unit_price,
          sort_order: item.sort_order ?? index,
        })),
        tx,
      );

      const invWithRel = await invoicesRepository.findInvoiceById(newInvoice.id, organizationId, tx);
      if (invWithRel) {
        await InvoiceCreated.dispatch(
          {
            invoice_id: newInvoice.id,
            organization_id: organizationId,
            client_id: clientId,
            matter_id: data.matter_id || null,
            invoice_number: newInvoice.invoice_number,
            total: totals.total,
          },
          {
            actorId: user.id,
            actorType: 'user',
            organizationId,
            tx,
          },
        );
      }

      return invWithRel;
    });

    if (!invoice) return result.internalError('Failed to retrieve created invoice');

    return result.ok(transformInvoiceResponse(invoice));
  } catch (error) {
    return handleServiceError(error, logger, { organizationId, userId: user.id }, 'Failed to create invoice');
  }
};


/**
 * List invoices
 */
const listInvoices = async (
  organizationId: string,
  filters: ListInvoicesQuery,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<PaginatedResult<InvoiceResponse, 'invoices'>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    // Short-circuit: direct lookup when a specific invoice ID is provided
    if (filters.invoice_id) {
      const invoice = await invoicesRepository.findInvoiceById(filters.invoice_id, organizationId);
      if (!invoice) return result.ok({ invoices: [], total: 0 });
      return result.ok({ invoices: [transformInvoiceResponse(invoice)], total: 1 });
    }

    const { invoices: list, total } = await invoicesRepository.listInvoicesByOrganization(organizationId, {
      clientId: filters.client_id,
      matterId: filters.matter_id,
      status: filters.status,
      page: filters.page,
      limit: filters.limit,
    });

    return result.ok({
      invoices: list.map((i) => transformInvoiceResponse(i)),
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list invoices {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return result.internalError('Failed to list invoices');
  }
};

/**
 * Update a draft invoice
 */
const updateInvoice = async (
  organizationId: string,
  invoiceId: string,
  data: UpdateInvoiceRequest,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const existing = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!existing) return result.notFound('Invoice not found');

    // Only allow updating non-draft invoices if updating status ONLY
    if (existing.status !== 'draft') {
      const updateKeys = Object.keys(data);
      const isStatusOnlyUpdate = updateKeys.length === 1 && updateKeys[0] === 'status';

      if (!isStatusOnlyUpdate) {
        return result.badRequest('Only draft invoices can be modified (except status updates)');
      }
    }

    const { line_items, ...invoiceData } = data;

    const updatedInvoice = await db.transaction(async (tx) => {
      let totals = {};
      if (line_items) {
        totals = calculateInvoiceTotals(line_items);
        await invoicesRepository.deleteInvoiceLineItems(invoiceId, tx);
        await invoicesRepository.createInvoiceLineItems(
          (line_items || []).map((item, index) => ({
            ...item,
            invoice_id: invoiceId,
            line_total: item.quantity * item.unit_price,
            sort_order: item.sort_order ?? index,
          })),
          tx,
        );
      }

      await invoicesRepository.updateInvoice(
        invoiceId,
        organizationId,
        {
          ...invoiceData,
          ...totals,
          due_date: data.due_date ? new Date(data.due_date) : undefined,
        },
        tx,
      );

      const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId, tx);
      if (updated) {
        await InvoiceUpdated.dispatch({
          invoice_id: invoiceId,
          organization_id: organizationId,
          changes: data,
        }, {
          actorId: user.id,
          actorType: 'user',
          organizationId,
          tx,
        });
      }

      return updated;
    });

    if (!updatedInvoice) return result.internalError('Failed to retrieve updated invoice');

    return result.ok(transformInvoiceResponse(updatedInvoice));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError('Failed to update invoice');
  }
};

/**
 * Soft delete an invoice
 */
const deleteInvoice = async (
  organizationId: string,
  invoiceId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<{ success: true }>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const existing = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!existing) return result.notFound('Invoice not found');

    if (existing.status !== 'draft') {
      return result.badRequest('Only draft invoices can be deleted');
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.softDeleteInvoice(invoiceId, organizationId, user.id, tx);
      await InvoiceDeleted.dispatch({
        invoice_id: invoiceId,
        organization_id: organizationId,
        deleted_by: 'user',
      }, {
        actorId: user.id,
        actorType: 'user',
        organizationId,
        tx,
      });
    });
    return result.ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError('Failed to delete invoice');
  }
};

/**
 * Send an invoice via Stripe
 */
const sendInvoice = async (
  organizationId: string,
  invoiceId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!invoice) return result.notFound('Invoice not found');

    if (invoice.status !== 'draft') {
      return result.badRequest('Only draft invoices can be sent');
    }

    const invWithRel = invoice;
    if (!invWithRel.client?.stripe_customer_id) {
      return result.badRequest('Client is missing Stripe customer ID');
    }

    // 1. Create on Stripe
    const stripeResult = await stripeInvoicesService.createStripeInvoice(
      invWithRel,
      invWithRel.client.stripe_customer_id,
    );
    if (!stripeResult.success) return stripeResult;

    const stripeInvoice = stripeResult.data;

    // 2. Finalize and send
    const sendResult = await stripeInvoicesService.finalizeAndSendInvoice(
      stripeInvoice.id,
      invoice.connected_account_id,
    );
    if (!sendResult.success) return sendResult;

    const finalInvoice = sendResult.data;

    // 3. Update internal status
    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(invoiceId, organizationId, {
        status: 'sent',
        stripe_invoice_id: finalInvoice.id,
        stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url,
        issue_date: new Date(),
      }, tx);

      await InvoiceSent.dispatch({
        invoice_id: invoiceId,
        organization_id: organizationId,
        client_id: invWithRel.client_id,
        stripe_invoice_id: finalInvoice.id,
        stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url!,
        total: invWithRel.total,
      }, {
        actorId: user.id,
        actorType: 'user',
        organizationId,
        tx,
      });
    });

    const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!updated) return result.internalError('Failed to retrieve updated invoice');


    return result.ok(transformInvoiceResponse(updated));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId }, 'Failed to finalize and send invoice');
  }
};

/**
 * Sync invoice with Stripe
 */
const syncInvoice = async (
  organizationId: string,
  invoiceId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!invoice) return result.notFound('Invoice not found');
    if (!invoice.stripe_invoice_id) return result.badRequest('Invoice has not been synced with Stripe');

    // 1. Fetch from Stripe
    const stripeResult = await stripeInvoicesService.getStripeInvoice(
      invoice.stripe_invoice_id,
      invoice.connected_account_id,
    );
    if (!stripeResult.success) return stripeResult;

    const stripeInvoice = stripeResult.data;

    // 2. Map Stripe status to internal status
    const statusMap: Record<string, string> = {
      draft: 'draft',
      open: 'sent',
      paid: 'paid',
      uncollectible: 'overdue',
      void: 'cancelled',
    };

    // 3. Update local DB
    await invoicesRepository.updateInvoice(invoiceId, organizationId, {
      status: statusMap[stripeInvoice.status || ''] || invoice.status,
      amount_paid: stripeInvoice.amount_paid,
      amount_due: stripeInvoice.amount_remaining,
      paid_at: stripeInvoice.status_transitions.paid_at
        ? fromStripeTimestamp(stripeInvoice.status_transitions.paid_at)
        : undefined,
    });

    const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!updated) return result.notFound('Invoice not found');

    return result.ok(transformInvoiceResponse(updated));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId }, 'Failed to sync invoice with Stripe');
  }
};

/**
 * Void an invoice via Stripe
 */
const voidInvoice = async (
  organizationId: string,
  invoiceId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  const orgResult = await organizationService.getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!invoice) return result.notFound('Invoice not found');

    // Can only void sent/open invoices
    if (invoice.status !== 'sent') {
      return result.badRequest('Only sent invoices can be voided');
    }

    if (!invoice.stripe_invoice_id) {
      return result.badRequest('Invoice has no Stripe record');
    }

    // Void on Stripe
    const voidResult = await stripeInvoicesService.voidInvoice(
      invoice.stripe_invoice_id,
      invoice.connected_account_id,
    );
    if (!voidResult.success) return voidResult;

    await db.transaction(async (tx) => {
      // Update local status
      await invoicesRepository.updateInvoice(invoiceId, organizationId, {
        status: 'cancelled',
      }, tx);

      await InvoiceVoided.dispatch({
        invoice_id: invoiceId,
        organization_id: organizationId,
        stripe_invoice_id: invoice.stripe_invoice_id,
        voided_by: 'user',
      }, {
        actorId: user.id,
        actorType: 'user',
        organizationId: organizationId,
        tx,
      });
    });

    const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!updated) return result.notFound('Invoice not found');

    return result.ok(transformInvoiceResponse(updated));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId }, 'Failed to void invoice');
  }
};

export const invoicesService = {
  createInvoice,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  syncInvoice,
  voidInvoice,
};
