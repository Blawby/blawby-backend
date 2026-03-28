import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { handleInvoicePaid } from '@/modules/invoices/services/invoice-paid.handler';
import {
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleInvoiceDeleted,
} from '@/modules/invoices/services/invoice-lifecycle.handlers';
import { handleInvoiceUpcoming, handleInvoiceCreated } from '@/modules/invoices/services/invoice-metering.handlers';
import { isStripeInvoice } from '@/shared/utils/stripeGuards';

const logger = getLogger(['invoices', 'webhooks-service']);

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
    case 'invoice.upcoming':
      await handleInvoiceUpcoming(stripeInvoice);
      return;
    case 'invoice.created':
      await handleInvoiceCreated(stripeInvoice);
      return;
    case 'invoice.paid':
      await handleInvoicePaid(stripeInvoice);
      return;
    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(stripeInvoice);
      return;
    case 'invoice.voided':
      await handleInvoiceVoided(stripeInvoice);
      return;
    case 'invoice.deleted':
      await handleInvoiceDeleted(stripeInvoice);
      return;
    default:
      logger.info('Unhandled invoice event type: {eventType}', { eventType });
      return;
  }
};

/**
 * Invoice Webhooks Service
 *
 * Orchestrates Stripe invoice-related webhook events.
 * Handlers are modularized into separate files by concern:
 * - invoice-paid.handler.ts: Complex revenue processing (fund routing, retainers, metering)
 * - invoice-lifecycle.handlers.ts: Simple status transitions (failed, voided, deleted)
 * - invoice-metering.handlers.ts: Seat-based billing sync (upcoming, created)
 */
export const invoiceWebhooksService = {
  processEvent,
  handleInvoiceUpcoming,
  handleInvoiceCreated,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
  handleInvoiceVoided,
  handleInvoiceDeleted,
};
