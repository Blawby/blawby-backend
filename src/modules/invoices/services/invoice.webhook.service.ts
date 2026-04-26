import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { db } from '@/shared/database';
import { InvoiceDeleted, InvoicePaymentFailed, InvoiceVoided } from '@/shared/events/definitions';
import { InvoiceStripePaymentReceived } from '@/modules/invoices/types/events';

const logger = getLogger(['invoices', 'webhook-service']);
const IGNORED_INVOICE_EVENTS = [
  'invoice.created',
  'invoice.finalized',
  'invoice.updated',
  'invoice.sent',
  'invoice.marked_uncollectible',
] as const;

const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
    return;
  }

  await InvoiceStripePaymentReceived.dispatch(
    {
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      stripe_invoice_id: stripeInvoice.id,
      stripe_amount_paid: stripeInvoice.amount_paid,
      stripe_amount_remaining: stripeInvoice.amount_remaining,
      stripe_paid_at: stripeInvoice.status_transitions.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      stripe_customer_id: stripeInvoice.customer as string | null,
      stripe_on_behalf_of:
        typeof stripeInvoice.on_behalf_of === 'string'
          ? stripeInvoice.on_behalf_of
          : (stripeInvoice.on_behalf_of?.id ?? null),
    },
    {
      actorId: 'webhook',
      actorType: 'webhook',
      organizationId: invoice.organization_id,
      critical: true,
    }
  );
};

const handleInvoicePaymentFailed = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
    return;
  }

  await db.transaction(async (tx) => {
    await invoicesRepository.updateInvoice(invoice.id, invoice.organization_id, { status: 'overdue' }, tx);

    await InvoicePaymentFailed.dispatch(
      {
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        stripe_invoice_id: stripeInvoice.id,
      },
      {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      }
    );
  });
};

const handleInvoiceVoided = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
    return;
  }

  await db.transaction(async (tx) => {
    await invoicesRepository.updateInvoice(invoice.id, invoice.organization_id, { status: 'cancelled' }, tx);

    await InvoiceVoided.dispatch(
      {
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        stripe_invoice_id: stripeInvoice.id,
        voided_by: 'webhook',
      },
      {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      }
    );
  });
};

const handleInvoiceDeleted = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
    return;
  }

  await db.transaction(async (tx) => {
    await invoicesRepository.softDeleteInvoice(invoice.id, invoice.organization_id, null, tx);

    await InvoiceDeleted.dispatch(
      {
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        deleted_by: 'webhook',
      },
      {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      }
    );
  });
};

const isStripeInvoice = (obj: unknown): obj is Stripe.Invoice =>
  obj !== null &&
  typeof obj === 'object' &&
  'object' in obj &&
  obj.object === 'invoice' &&
  'id' in obj &&
  typeof obj.id === 'string' &&
  'status_transitions' in obj &&
  typeof obj.status_transitions === 'object' &&
  obj.status_transitions !== null;

const processEvent = async (event: Stripe.Event): Promise<void> => {
  const stripeInvoice = event.data.object;

  if (!isStripeInvoice(stripeInvoice)) {
    logger.warn('Received Stripe event without invoice object: {eventType}', { eventType: event.type });
    return;
  }

  switch (event.type) {
    case 'invoice.paid':
      await handleInvoicePaid(stripeInvoice);
      break;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(stripeInvoice);
      break;
    case 'invoice.voided':
      await handleInvoiceVoided(stripeInvoice);
      break;
    case 'invoice.deleted':
      await handleInvoiceDeleted(stripeInvoice);
      break;
    default:
      if (IGNORED_INVOICE_EVENTS.includes(event.type as (typeof IGNORED_INVOICE_EVENTS)[number])) {
        logger.info('Ignoring invoice event type: {eventType} for Stripe invoice {stripeInvoiceId}', {
          eventType: event.type,
          stripeInvoiceId: stripeInvoice.id,
          stripeInvoiceNumber: stripeInvoice.number,
        });
        return;
      }

      logger.error('Unhandled invoice event type: {eventType} for Stripe invoice {stripeInvoiceId}', {
        eventType: event.type,
        stripeInvoiceId: stripeInvoice.id,
        stripeInvoiceNumber: stripeInvoice.number,
      });
      throw new Error('UnhandledInvoiceEventType');
  }
};

export const invoiceWebhookService = {
  processEvent,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleInvoiceDeleted,
} as const;
