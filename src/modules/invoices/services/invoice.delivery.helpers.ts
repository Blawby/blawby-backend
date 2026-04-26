import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type { Stripe } from 'stripe';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { InvoiceSent, SystemErrorOccurred } from '@/shared/events/definitions';
import { db } from '@/shared/database';
import { addInvoiceVoidReconciliationJob } from '@/shared/queue/queue.manager';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'delivery-service']);

export const enqueueVoidReconciliation = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
}: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
}): Promise<void> => {
  try {
    await addInvoiceVoidReconciliationJob({
      invoiceId,
      organizationId,
      stripeInvoiceId,
    });
  } catch (queueError) {
    logger.error('Failed to queue invoice void reconciliation job: {error}', {
      invoiceId,
      organizationId,
      stripeInvoiceId,
      error: queueError instanceof Error ? queueError.message : 'Unknown error',
    });
  }
};

export const dispatchVoidSystemError = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
  ctx,
}: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
  ctx: ServiceContext;
}): Promise<void> => {
  await SystemErrorOccurred.dispatch(
    {
      error: 'Invoice marked cancelled but Stripe void failed',
      context: {
        invoiceId,
        organizationId,
        stripeInvoiceId,
        recovery: 'Re-run invoice void reconciliation against Stripe',
      },
    },
    {
      actorId: ctx.userId,
      actorType: 'user',
      organizationId,
    }
  );
};

export const lockInvoiceForSending = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  return await db.transaction(async (tx) => {
    const found = await invoicesRepository.findInvoiceById(id, ctx.organizationId, tx);
    if (!found) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    if (found.status !== 'draft') {
      throw new HTTPException(400, { message: 'Only draft invoices can be sent' });
    }

    if (!found.lineItems.length) {
      throw new HTTPException(400, { message: 'Cannot send an invoice with no line items' });
    }

    if (found.total <= 0) {
      throw new HTTPException(400, { message: 'Cannot send an invoice with zero or negative total' });
    }

    const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(
      id,
      ctx.organizationId,
      'draft',
      'sending',
      tx
    );
    if (!lockedInvoice) {
      throw new HTTPException(409, { message: 'Invoice is already being sent by another request' });
    }

    return found;
  });
};

export const createAndSendStripeInvoice = async ({
  invWithRel,
  idempotencyKeyPrefix,
}: {
  invWithRel: InvoiceWithRelations;
  idempotencyKeyPrefix?: string;
}): Promise<Stripe.Invoice> => {
  if (!invWithRel.client?.stripe_customer_id) {
    throw new Error('Client is missing Stripe customer ID');
  }
  if (!invWithRel.connectedAccount?.stripe_account_id) {
    throw new Error('Connected account is missing Stripe account ID');
  }

  const stripeInvoice = await stripeApiAdapter.createStripeInvoice(
    invWithRel,
    invWithRel.client.stripe_customer_id,
    invWithRel.connectedAccount.stripe_account_id,
    idempotencyKeyPrefix
  );

  return await stripeApiAdapter.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
};

export const markInvoiceSent = async (
  {
    invoiceId,
    invoice,
    stripeInvoice,
  }: {
    invoiceId: string;
    invoice: InvoiceWithRelations;
    stripeInvoice: Stripe.Invoice;
  },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  if (!stripeInvoice.hosted_invoice_url) {
    throw new Error('hosted_invoice_url missing from Stripe invoice response');
  }
  const hostedInvoiceUrl = stripeInvoice.hosted_invoice_url;

  return await db.transaction(async (tx) => {
    const transitioned = await invoicesRepository.transitionInvoiceStatus(
      invoiceId,
      ctx.organizationId,
      'sending',
      'sent',
      tx
    );
    if (!transitioned) {
      throw new HTTPException(409, { message: 'Invoice status changed while sending' });
    }

    await invoicesRepository.updateInvoice(
      invoiceId,
      ctx.organizationId,
      {
        stripe_invoice_id: stripeInvoice.id,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        issue_date: new Date(),
      },
      tx
    );

    await InvoiceSent.dispatch(
      {
        invoice_id: invoiceId,
        organization_id: ctx.organizationId,
        client_id: invoice.client_id,
        stripe_invoice_id: stripeInvoice.id,
        stripe_hosted_invoice_url: hostedInvoiceUrl,
        total: invoice.total,
      },
      {
        actorId: ctx.userId,
        actorType: 'user',
        organizationId: ctx.organizationId,
        tx,
      }
    );

    const updated = await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId, tx);
    if (!updated) {
      throw new Error('Invoice not found after update');
    }

    return updated;
  });
};

export const syncStripeState = async (
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
      : null,
  });

  return await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId);
};
