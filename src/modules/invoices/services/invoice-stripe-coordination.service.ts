import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { stripeInvoicesService } from '@/modules/invoices/services/stripe-invoices.service';
import type { InvoiceResponse, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { handleServiceError } from '@/modules/invoices/utils/error-handler';
import { db } from '@/shared/database';
import { InvoiceSent, InvoiceVoided } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import type { ServiceContext } from '@/shared/types/service-context';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'stripe-coordination-service']);

/**
 * Coordination for Stripe creation + finalization + DB update (SRP)
 */
const finalizeAndSendStripeFlow = async (
  {
    invoiceId,
    invWithRel,
    idempotencyKeyPrefix,
  }: {
    invoiceId: string;
    invWithRel: InvoiceWithRelations;
    idempotencyKeyPrefix?: string;
  },
  ctx: ServiceContext
): Promise<Result<InvoiceWithRelations>> => {
  // 1. Create on Stripe
  if (!invWithRel.client?.stripe_customer_id) {
    return result.badRequest('Client is missing Stripe customer ID');
  }

  const stripeResult = await stripeInvoicesService.createStripeInvoice(
    invWithRel,
    invWithRel.client.stripe_customer_id,
    invWithRel.connectedAccount.stripe_account_id,
    idempotencyKeyPrefix
  );
  if (!stripeResult.success) {
    return { success: false, error: stripeResult.error };
  }

  const stripeInvoice = stripeResult.data;

  // 2. Finalize and send
  const sendResult = await stripeInvoicesService.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
  if (!sendResult.success) {
    return { success: false, error: sendResult.error };
  }

  const finalInvoice = sendResult.data;

  // 3. Update internal status
  try {
    const updated = await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoiceId,
        ctx.organizationId,
        {
          status: 'sent',
          stripe_invoice_id: finalInvoice.id,
          stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url,
          issue_date: new Date(),
        },
        tx
      );

      await InvoiceSent.dispatch(
        {
          invoice_id: invoiceId,
          organization_id: ctx.organizationId,
          client_id: invWithRel.client_id,
          stripe_invoice_id: finalInvoice.id,
          stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url!,
          total: invWithRel.total,
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
          tx,
        }
      );

      return await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId, tx);
    });

    if (!updated) {
      return result.notFound<InvoiceWithRelations>('Invoice not found after update');
    }
    return result.ok<InvoiceWithRelations>(updated);
  } catch (error) {
    logger.error('Failed to finalize and send Stripe flow: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId,
    });
    return result.internalError<InvoiceWithRelations>('Failed to update invoice status after sending');
  }
};

/**
 * Coordination for external -> internal status mapping (SRP)
 */
const syncStripeState = async (
  {
    invoiceId,
    stripeInvoice,
    currentInvoice,
  }: {
    invoiceId: string;
    stripeInvoice: Stripe.Invoice;
    currentInvoice: InvoiceWithRelations;
  },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> => {
  const statusMap: Record<string, string> = {
    draft: 'draft',
    open: 'sent',
    paid: 'paid',
    uncollectible: 'overdue',
    void: 'cancelled',
  };

  await invoicesRepository.updateInvoice(invoiceId, ctx.organizationId, {
    status: statusMap[stripeInvoice.status ?? ''] || currentInvoice.status,
    amount_paid: stripeInvoice.amount_paid,
    amount_due: stripeInvoice.amount_remaining,
    paid_at: stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : undefined,
  });

  return await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId);
};

/**
 * Send an invoice via Stripe
 */
const sendInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<Result<InvoiceResponse>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      return result.notFound<InvoiceResponse>('Invoice not found');
    }

    if (invoice.status !== 'draft') {
      return result.badRequest<InvoiceResponse>('Only draft invoices can be sent');
    }

    if (!invoice.lineItems?.length) {
      return result.badRequest<InvoiceResponse>('Cannot send an invoice with no line items');
    }

    if (invoice.total <= 0) {
      return result.badRequest<InvoiceResponse>('Cannot send an invoice with zero or negative total');
    }

    if (!invoice.client?.stripe_customer_id) {
      return result.badRequest<InvoiceResponse>('Client is missing Stripe customer ID');
    }

    const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'draft', 'sending');
    if (!lockedInvoice) {
      return result.conflict<InvoiceResponse>('Invoice is already being sent by another request');
    }

    const idempotencyKeyPrefix = `invoice-send:${id}`;
    const updated = await finalizeAndSendStripeFlow({ invoiceId: id, invWithRel: invoice, idempotencyKeyPrefix }, ctx);

    if (!updated.success) {
      await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'sending', 'draft');
      return { success: false, error: updated.error };
    }

    const updatedInvoice = updated.data;
    if (!updatedInvoice) {
      return result.internalError<InvoiceResponse>('Failed to retrieve updated invoice');
    }

    return result.ok<InvoiceResponse>(invoiceQueriesService.transformInvoiceResponse(updatedInvoice));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId: id }, 'Failed to finalize and send invoice');
  }
};

/**
 * Sync invoice with Stripe
 */
const syncInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<Result<InvoiceResponse>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      return result.notFound<InvoiceResponse>('Invoice not found');
    }
    if (!invoice.stripe_invoice_id) {
      return result.badRequest<InvoiceResponse>('Invoice has not been synced with Stripe');
    }

    // 1. Fetch from Stripe
    const stripeResult = await stripeInvoicesService.getStripeInvoice(invoice.stripe_invoice_id);
    if (!stripeResult.success) {
      return { success: false, error: stripeResult.error };
    }

    // 2. Sync State
    const updated = await syncStripeState(
      {
        invoiceId: id,
        stripeInvoice: stripeResult.data,
        currentInvoice: invoice,
      },
      ctx
    );

    if (!updated) {
      return result.notFound<InvoiceResponse>('Invoice not found');
    }

    return result.ok<InvoiceResponse>(invoiceQueriesService.transformInvoiceResponse(updated));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId: id }, 'Failed to sync invoice with Stripe');
  }
};

/**
 * Void an invoice via Stripe
 */
const voidInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<Result<InvoiceResponse>> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      return result.notFound<InvoiceResponse>('Invoice not found');
    }

    if (invoice.status !== 'sent') {
      return result.badRequest<InvoiceResponse>('Only sent invoices can be voided');
    }

    if (!invoice.stripe_invoice_id) {
      return result.badRequest<InvoiceResponse>('Invoice has no Stripe record');
    }

    // Void on Stripe
    const voidResult = await stripeInvoicesService.voidInvoice(invoice.stripe_invoice_id);
    if (!voidResult.success) {
      return { success: false, error: voidResult.error };
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(id, ctx.organizationId, { status: 'cancelled' }, tx);
      await InvoiceVoided.dispatch(
        {
          invoice_id: id,
          organization_id: ctx.organizationId,
          stripe_invoice_id: invoice.stripe_invoice_id!,
          voided_by: 'user',
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
          tx,
        }
      );
    });

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!updated) {
      return result.notFound<InvoiceResponse>('Invoice not found');
    }

    return result.ok<InvoiceResponse>(invoiceQueriesService.transformInvoiceResponse(updated));
  } catch (error) {
    return handleServiceError(error, logger, { invoiceId: id }, 'Failed to void invoice');
  }
};

export const invoiceStripeCoordinationService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
};
