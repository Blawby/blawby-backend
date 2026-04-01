import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { stripeInvoicesService } from '@/modules/invoices/services/stripe-invoices.service';
import type { InvoiceResponse, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceSent, InvoiceVoided } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { createAppError, createValidationError, createTransactionError } from '@/shared/types/errors';

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
): Promise<InvoiceWithRelations> => {
  // 1. Create on Stripe
  if (!invWithRel.client?.stripe_customer_id) {
    throw createAppError('STRIPE_CUSTOMER_MISSING', 'Client is missing Stripe customer ID', 500, {
      invoiceId,
      clientId: invWithRel.client_id,
    });
  }

  const stripeResult = await stripeInvoicesService.createStripeInvoice(
    invWithRel,
    invWithRel.client.stripe_customer_id,
    invWithRel.connectedAccount.stripe_account_id,
    idempotencyKeyPrefix
  );
  if (!stripeResult.success) {
    throw createAppError(
      'STRIPE_INVOICE_CREATION_FAILED',
      stripeResult.error?.message || 'Failed to create Stripe invoice',
      500,
      {
        invoiceId,
        stripeError: stripeResult.error?.code,
      }
    );
  }

  const stripeInvoice = stripeResult.data;

  // 2. Finalize and send
  const sendResult = await stripeInvoicesService.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
  if (!sendResult.success) {
    throw createAppError(
      'STRIPE_INVOICE_SEND_FAILED',
      sendResult.error?.message || 'Failed to send Stripe invoice',
      500,
      {
        invoiceId,
        stripeInvoiceId: stripeInvoice.id,
        stripeError: sendResult.error?.code,
      }
    );
  }

  const finalInvoice = sendResult.data;

  // 3. Update internal status
  try {
    const executor = ctx.db;
    await invoicesRepository.updateInvoice(
      invoiceId,
      ctx.organizationId,
      {
        status: 'sent',
        stripe_invoice_id: finalInvoice.id,
        stripe_hosted_invoice_url: finalInvoice.hosted_invoice_url,
        issue_date: new Date(),
      },
      executor
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
        tx: executor,
      }
    );

    const updated = await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId, executor);

    if (!updated) {
      throw createAppError('INVOICE_RETRIEVAL_FAILED', 'Invoice not found after update', 500, {
        invoiceId,
        organizationId: ctx.organizationId,
      });
    }
    return updated;
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    logger.error('Failed to finalize and send Stripe flow: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId,
    });
    throw createTransactionError('STRIPE_FLOW_FAILED', 'Failed to update invoice status after sending', {
      invoiceId,
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : String(error),
    });
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
const sendInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceResponse> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    let invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    if (invoice.status !== 'draft') {
      throw createValidationError('INVOICE_NOT_DRAFT', 'Only draft invoices can be sent', {
        invoiceId: id,
        currentStatus: invoice.status,
      });
    }

    if (!invoice.lineItems?.length) {
      throw createValidationError('INVOICE_NO_LINE_ITEMS', 'Cannot send an invoice with no line items', {
        invoiceId: id,
      });
    }

    if (invoice.total <= 0) {
      throw createValidationError('INVOICE_INVALID_TOTAL', 'Cannot send an invoice with zero or negative total', {
        invoiceId: id,
      });
    }

    if (!invoice.client?.stripe_customer_id) {
      try {
        const setupResult = await clientsCrudService.ensureClientSetup({ id: invoice.client_id }, ctx);

        if (!setupResult.stripe_customer_id) {
          throw createAppError('STRIPE_CUSTOMER_SETUP_FAILED', 'Failed to setup Stripe customer for client', 500, {
            invoiceId: id,
            clientId: invoice.client_id,
          });
        }

        // Refetch invoice to get updated client with stripe_customer_id
        const freshInvoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
        if (!freshInvoice) {
          throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found after client setup', 404, {
            invoiceId: id,
            organizationId: ctx.organizationId,
          });
        }
        invoice = freshInvoice;
      } catch (error) {
        // Re-throw AppErrors as-is
        if (error && typeof error === 'object' && 'kind' in error) {
          throw error;
        }
        throw createAppError(
          'STRIPE_CUSTOMER_SETUP_FAILED',
          error instanceof Error ? error.message : 'Failed to setup Stripe customer for client',
          500,
          {
            invoiceId: id,
            clientId: invoice.client_id,
          }
        );
      }
    }

    const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'draft', 'sending');
    if (!lockedInvoice) {
      throw createAppError('INVOICE_ALREADY_SENDING', 'Invoice is already being sent by another request', 409, {
        invoiceId: id,
      });
    }

    const idempotencyKeyPrefix = `invoice-send:${id}`;
    try {
      const updatedInvoice = await finalizeAndSendStripeFlow(
        { invoiceId: id, invWithRel: invoice, idempotencyKeyPrefix },
        ctx
      );

      return invoiceQueriesService.transformInvoiceResponse(updatedInvoice);
    } catch (error) {
      // Rollback status to draft if Stripe flow failed
      await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'sending', 'draft');
      throw error;
    }
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    logger.error('Failed to finalize and send invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw createTransactionError('INVOICE_SEND_FAILED', 'Failed to finalize and send invoice', {
      invoiceId: id,
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Sync invoice with Stripe
 */
const syncInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceResponse> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }
    if (!invoice.stripe_invoice_id) {
      throw createValidationError('INVOICE_NOT_SYNCED', 'Invoice has not been synced with Stripe', {
        invoiceId: id,
      });
    }

    // 1. Fetch from Stripe
    const stripeResult = await stripeInvoicesService.getStripeInvoice(invoice.stripe_invoice_id);
    if (!stripeResult.success) {
      throw createAppError(
        'STRIPE_FETCH_FAILED',
        stripeResult.error?.message || 'Failed to fetch invoice from Stripe',
        500,
        {
          invoiceId: id,
          stripeInvoiceId: invoice.stripe_invoice_id,
          stripeError: stripeResult.error?.code,
        }
      );
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
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found after sync', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    return invoiceQueriesService.transformInvoiceResponse(updated);
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    logger.error('Failed to sync invoice with Stripe: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw createTransactionError('INVOICE_SYNC_FAILED', 'Failed to sync invoice with Stripe', {
      invoiceId: id,
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Void an invoice via Stripe
 */
const voidInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceResponse> => {
  // CASL Check
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    if (invoice.status !== 'sent') {
      throw createValidationError('INVOICE_NOT_SENT', 'Only sent invoices can be voided', {
        invoiceId: id,
        currentStatus: invoice.status,
      });
    }

    if (!invoice.stripe_invoice_id) {
      throw createValidationError('INVOICE_NO_STRIPE_RECORD', 'Invoice has no Stripe record', {
        invoiceId: id,
      });
    }

    // Void on Stripe
    const voidResult = await stripeInvoicesService.voidInvoice(invoice.stripe_invoice_id);
    if (!voidResult.success) {
      throw createAppError('STRIPE_VOID_FAILED', voidResult.error?.message || 'Failed to void invoice on Stripe', 500, {
        invoiceId: id,
        stripeInvoiceId: invoice.stripe_invoice_id,
        stripeError: voidResult.error?.code,
      });
    }

    const executor = ctx.db;
    await invoicesRepository.updateInvoice(id, ctx.organizationId, { status: 'cancelled' }, executor);
    await InvoiceVoided.dispatch(
      {
        invoice_id: id,
        organization_id: ctx.organizationId,
        stripe_invoice_id: invoice.stripe_invoice_id,
        voided_by: 'user',
      },
      {
        actorId: ctx.userId,
        actorType: 'user',
        organizationId: ctx.organizationId,
        tx: executor,
      }
    );

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!updated) {
      throw createAppError('INVOICE_NOT_FOUND', 'Invoice not found after void', 404, {
        invoiceId: id,
        organizationId: ctx.organizationId,
      });
    }

    return invoiceQueriesService.transformInvoiceResponse(updated);
  } catch (error) {
    // Re-throw AppErrors as-is
    if (error && typeof error === 'object' && 'kind' in error) {
      throw error;
    }

    logger.error('Failed to void invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw createTransactionError('INVOICE_VOID_FAILED', 'Failed to void invoice', {
      invoiceId: id,
      organizationId: ctx.organizationId,
      cause: error instanceof Error ? error.message : String(error),
    });
  }
};

export const invoiceStripeCoordinationService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
};
