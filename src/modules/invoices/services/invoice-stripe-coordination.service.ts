import { ForbiddenError } from '@casl/ability';
import { HTTPException } from 'hono/http-exception';
import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { invoiceQueriesService } from '@/modules/invoices/services/invoice-queries.service';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import type { InvoiceResponse, InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceSent, InvoiceVoided } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

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
    throw new Error('Client is missing Stripe customer ID');
  }

  const stripeInvoice = await stripeApiAdapter.createStripeInvoice(
    invWithRel,
    invWithRel.client.stripe_customer_id,
    invWithRel.connectedAccount.stripe_account_id,
    idempotencyKeyPrefix
  );

  // 2. Finalize and send
  const finalInvoice = await stripeApiAdapter.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);

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
      throw new Error('Invoice not found after update');
    }
    return updated;
  } catch (error) {
    logger.error('Failed to finalize and send Stripe flow: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId,
    });
    throw new Error('Failed to update invoice status after sending');
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
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    if (invoice.status !== 'draft') {
      throw new HTTPException(400, { message: 'Only draft invoices can be sent' });
    }

    if (!invoice.lineItems?.length) {
      throw new HTTPException(400, { message: 'Cannot send an invoice with no line items' });
    }

    if (invoice.total <= 0) {
      throw new HTTPException(400, { message: 'Cannot send an invoice with zero or negative total' });
    }

    if (!invoice.client?.stripe_customer_id) {
      try {
        const setupResult = await clientsCrudService.ensureClientSetup({ id: invoice.client_id }, ctx);

        if (!setupResult.stripe_customer_id) {
          throw new Error('Failed to setup Stripe customer for client');
        }

        // Refetch invoice to get updated client with stripe_customer_id
        const freshInvoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
        if (!freshInvoice) {
          throw new HTTPException(404, { message: 'Invoice not found after client setup' });
        }
        invoice = freshInvoice;
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to setup Stripe customer for client');
      }
    }

    const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'draft', 'sending');
    if (!lockedInvoice) {
      throw new HTTPException(409, { message: 'Invoice is already being sent by another request' });
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
    if (error instanceof HTTPException) throw error;
    logger.error('Failed to finalize and send invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to finalize and send invoice');
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
      throw new HTTPException(404, { message: 'Invoice not found' });
    }
    if (!invoice.stripe_invoice_id) {
      throw new HTTPException(400, { message: 'Invoice has not been synced with Stripe' });
    }

    // 1. Fetch from Stripe
    const stripeInvoice = await stripeApiAdapter.getStripeInvoice(invoice.stripe_invoice_id);

    // 2. Sync State
    const updated = await syncStripeState(
      {
        invoiceId: id,
        stripeInvoice,
        currentInvoice: invoice,
      },
      ctx
    );

    if (!updated) {
      throw new HTTPException(404, { message: 'Invoice not found after sync' });
    }

    return invoiceQueriesService.transformInvoiceResponse(updated);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    logger.error('Failed to sync invoice with Stripe: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to sync invoice with Stripe');
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
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    if (invoice.status !== 'sent') {
      throw new HTTPException(400, { message: 'Only sent invoices can be voided' });
    }

    if (!invoice.stripe_invoice_id) {
      throw new HTTPException(400, { message: 'Invoice has no Stripe record' });
    }

    // Void on Stripe
    await stripeApiAdapter.voidInvoice(invoice.stripe_invoice_id);

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
      throw new HTTPException(404, { message: 'Invoice not found after void' });
    }

    return invoiceQueriesService.transformInvoiceResponse(updated);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    logger.error('Failed to void invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to void invoice');
  }
};

export const invoiceStripeCoordinationService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
};
