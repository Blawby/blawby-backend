import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import type { Stripe } from 'stripe';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceSent } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'delivery-lock']);

export const lockInvoiceForSending = async (
  { id }: { id: string },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  return await ctx.db.transaction(async (tx) => {
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

    const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'draft', 'sending', tx);
    if (!lockedInvoice) {
      throw new HTTPException(409, { message: 'Invoice is already being sent by another request' });
    }

    return found;
  });
};

export const createAndSendStripeInvoice = async ({
  invWithRel,
  idempotencyKeyPrefix,
  stripeAccountId,
}: {
  invWithRel: InvoiceWithRelations;
  idempotencyKeyPrefix?: string;
  stripeAccountId: string;
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
    stripeAccountId,
    idempotencyKeyPrefix
  );

  return await stripeApiAdapter.finalizeAndSendInvoice(stripeInvoice.id, stripeAccountId, idempotencyKeyPrefix);
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

  return await ctx.db.transaction(async (tx) => {
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
      logger.error('Invoice not found after markInvoiceSent: {invoiceId}', { invoiceId });
      throw new Error('Invoice not found after update');
    }

    return updated;
  });
};
