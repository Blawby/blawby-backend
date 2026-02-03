import { getLogger } from '@logtape/logtape';
import { invoicesRepository } from '../database/queries/invoices.repository';
import type {
  CreateInvoiceRequest,
  UpdateInvoiceRequest,
  ListInvoicesQuery,
  InvoiceResponse,
  InvoiceWithRelations,
  SelectInvoiceLineItem,
} from '../types/invoices.types';
import { paymentLinksService } from './payment-links.service';
import { stripeInvoicesService } from './stripe-invoices.service';
import { getFullOrganization } from '@/modules/practice/services/organization.service';
import { db } from '@/shared/database';
import type { User } from '@/shared/types/BetterAuth';
import type { Result, PaginatedResult } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

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
 * Transform database invoice to response format
 */
const transformInvoiceResponse = (invoice: InvoiceWithRelations): InvoiceResponse => {
  return {
    ...invoice,
    issue_date: invoice.issue_date?.toISOString() || null,
    due_date: invoice.due_date?.toISOString() || null,
    paid_at: invoice.paid_at?.toISOString() || null,
    created_at: invoice.created_at.toISOString(),
    updated_at: invoice.updated_at.toISOString(),
    line_items: invoice.lineItems?.map((li: SelectInvoiceLineItem) => ({
      ...li,
      created_at: li.created_at.toISOString(),
      updated_at: li.updated_at.toISOString(),
    })),
  } as InvoiceResponse;
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  const { line_items, ...invoiceData } = data;
  const totals = calculateInvoiceTotals(line_items);

  try {
    const invoice = await db.transaction(async (tx) => {
      const newInvoice = await invoicesRepository.createInvoice(
        {
          organization_id: organizationId,
          ...invoiceData,
          ...totals,
          status: 'draft',
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

      return await invoicesRepository.findInvoiceById(newInvoice.id, organizationId);
    });

    if (!invoice) return result.internalError('Failed to retrieve created invoice');

    return result.ok(transformInvoiceResponse(invoice as InvoiceWithRelations));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create invoice {organizationId} {userId}: {error}', {
      organizationId,
      userId: user.id,
      error: message,
    });
    return result.internalError(message);
  }
};

/**
 * Get invoice by ID
 */
const getInvoiceById = async (
  organizationId: string,
  invoiceId: string,
  user: User,
  requestHeaders: Record<string, string>,
): Promise<Result<InvoiceResponse>> => {
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!invoice) return result.notFound('Invoice not found');

    return result.ok(transformInvoiceResponse(invoice as InvoiceWithRelations));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to get invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError(message);
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const { invoices: list, total } = await invoicesRepository.listInvoicesByOrganization(organizationId, filters);

    return result.ok({
      invoices: list.map((i) => transformInvoiceResponse(i as InvoiceWithRelations)),
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to list invoices {organizationId}: {error}', {
      organizationId,
      error: message,
    });
    return result.internalError(message);
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const existing = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!existing) return result.notFound('Invoice not found');

    // Only allow updating draft invoices for now
    if (existing.status !== 'draft' && !data.status) {
      return result.badRequest('Only draft invoices can be modified');
    }

    const { line_items, ...invoiceData } = data;

    const updatedInvoice = await db.transaction(async (tx) => {
      let totals = {};
      if (line_items) {
        totals = calculateInvoiceTotals(line_items);
        await invoicesRepository.deleteInvoiceLineItems(invoiceId, tx);
        await invoicesRepository.createInvoiceLineItems(
          line_items.map((item, index) => ({
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

      return await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    });

    if (!updatedInvoice) return result.internalError('Failed to retrieve updated invoice');

    return result.ok(transformInvoiceResponse(updatedInvoice as InvoiceWithRelations));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError(message);
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const existing = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!existing) return result.notFound('Invoice not found');

    if (existing.status !== 'draft') {
      return result.badRequest('Only draft invoices can be deleted');
    }

    await invoicesRepository.softDeleteInvoice(invoiceId, organizationId, user.id);
    return result.ok({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError(message);
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
  if (!orgResult.success) return orgResult;

  try {
    const invoice = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!invoice) return result.notFound('Invoice not found');

    if (invoice.status !== 'draft') {
      return result.badRequest('Only draft invoices can be sent');
    }

    const invWithRel = invoice as InvoiceWithRelations;
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
    await invoicesRepository.updateInvoice(invoiceId, organizationId, {
      status: 'sent',
      stripe_invoice_id: finalInvoice.id,
      stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url,
      // Note: payment_intent is no longer a top-level property on Stripe.Invoice in v20
      // It's now accessed via invoice.payments sub-resource if needed
      issue_date: new Date(),
    });

    const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    if (!updated) return result.internalError('Failed to retrieve updated invoice');

    // 4. Generate Payment Link for "Review & Pay" UI
    await paymentLinksService.createPaymentLink(invoiceId, organizationId);

    return result.ok(transformInvoiceResponse(updated as InvoiceWithRelations));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to send invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError(message);
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
  const orgResult = await getFullOrganization(organizationId, user, requestHeaders);
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
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : undefined,
    });

    const updated = await invoicesRepository.findInvoiceById(invoiceId, organizationId);
    return result.ok(transformInvoiceResponse(updated as InvoiceWithRelations));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to sync invoice {invoiceId}: {error}', {
      invoiceId,
      error: message,
    });
    return result.internalError(message);
  }
};

export const invoicesService = {
  createInvoice,
  getInvoiceById,
  listInvoices,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  syncInvoice,
};
