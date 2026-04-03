import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { db } from '@/shared/database';
import { InvoicePaymentFailed, InvoiceVoided, InvoiceDeleted } from '@/shared/events/definitions';
import { InvoiceStripePaymentReceived } from '@/modules/invoices/types/events';

const logger = getLogger(['invoices', 'webhooks-service']);

/**
 * Handle invoice.paid event from Stripe webhook
 * Thin handler: store event + queue async processing
 */
const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
    return;
  }

  logger.info('Storing invoice.paid event for async processing: {invoiceId}', {
    invoiceId: invoice.id,
    stripeInvoiceId: stripeInvoice.id,
    amount: stripeInvoice.amount_paid,
  });

  // Store to outbox with critical flag (persist before response)
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

  logger.info('Invoice.paid event queued for async processing');
};

/**
 * Handle invoice.payment_failed event
 */
const handleInvoicePaymentFailed = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    return;
  }

  await db.transaction(async (tx) => {
    await invoicesRepository.updateInvoice(
      invoice.id,
      invoice.organization_id,
      {
        status: 'overdue',
      },
      tx
    );

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

  logger.info('Payment failed for invoice {invoiceId}', { invoiceId: invoice.id });
};

/**
 * Handle invoice.voided event
 */
const handleInvoiceVoided = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
    return;
  }

  await db.transaction(async (tx) => {
    await invoicesRepository.updateInvoice(
      invoice.id,
      invoice.organization_id,
      {
        status: 'cancelled',
      },
      tx
    );

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

  logger.info('Invoice {invoiceId} voided', { invoiceId: invoice.id });
};

/**
 * Handle invoice.deleted event (for draft invoices)
 */
const handleInvoiceDeleted = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
  if (!invoice) {
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

  logger.info('Invoice {invoiceId} deleted via Stripe', { invoiceId: invoice.id });
};

/**
 * Type guard for Stripe Invoice
 */
const isStripeInvoice = (obj: unknown): obj is Stripe.Invoice =>
  obj !== null && typeof obj === 'object' && 'object' in obj && obj.object === 'invoice';

/**
 * Process a Stripe invoice event
 */
const processEvent = async (event: Stripe.Event): Promise<void> => {
  const eventType = event.type;
  const stripeInvoice = event.data.object;

  if (!isStripeInvoice(stripeInvoice)) {
    logger.warn('Received Stripe event without invoice object: {eventType}', { eventType });
    return;
  }

  logger.info('Processing invoice webhook event {eventType} for Stripe Invoice {stripeInvoiceId}', {
    eventType,
    stripeInvoiceId: stripeInvoice.id,
  });

  switch (eventType) {
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
      logger.info('Unhandled invoice event type: {eventType}', { eventType });
  }
};

/**
 * Invoice Webhooks Service
 *
 * Processes Stripe invoice-related webhook events.
 */
export const invoiceWebhooksService = {
  processEvent,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleInvoiceDeleted,
};
