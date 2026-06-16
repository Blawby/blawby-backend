/**
 * Invoices Module Event Listeners
 *
 * Handles invoice-related events that need post-processing after the
 * webhook handler has already acknowledged with 2xx. Metered usage
 * reporting is queued here: the InvoicePaid event is dispatched
 * transactionally inside the webhook handler, so the outbox worker creates
 * dedicated Graphile jobs without blocking payment processing.
 */

import { loadRequiredPayoutMeteredFeeCents } from '@/modules/invoices/services/invoice.utils';
import { METERED_TYPES } from '@/modules/subscriptions/constants/metered-products';
import { InvoicePaid, InvoiceRefunded, InvoiceStripePaymentReceived } from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { addInvoicePaymentJob, addMeteredUsageJob } from '@/shared/queue/queue.manager';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['invoices', 'listeners']);

/**
 * Register all invoice event listeners.
 *
 * These run inside the outbox worker (process-outbox-event task). Meter
 * reporting is handled by Graphile Worker with job-key deduplication.
 */
export const registerInvoicesListeners = (): void => {
  logger.info('Registering invoices event listeners...');

  /**
   * On invoice.paid: report metered usage for the invoice processing fee
   * (1 unit) and, if the payout fee amount is present in the context
   * record's metadata, for the payout fee as well.
   *
   * Note: payout-fee metering is rebuilt from the persisted payout
   * transaction so retries stay consistent with later refund credits.
   */
  /**
   * On invoice:stripe_payment_received: enqueue the process-invoice-payment
   * worker task. This is the bridge between the outbox and the worker.
   */
  Event.listen(InvoiceStripePaymentReceived, async (payload) => {
    logger.info('InvoiceStripePaymentReceived listener: enqueueing payment job for {stripeInvoiceId}', {
      stripeInvoiceId: payload.stripe_invoice_id,
    });

    await addInvoicePaymentJob({
      invoice_id: payload.invoice_id,
      organization_id: payload.organization_id,
      stripe_invoice_id: payload.stripe_invoice_id,
      stripe_amount_paid: payload.stripe_amount_paid,
      stripe_amount_remaining: payload.stripe_amount_remaining,
      stripe_paid_at: payload.stripe_paid_at,
      stripe_customer_id: payload.stripe_customer_id,
      stripe_on_behalf_of: payload.stripe_on_behalf_of,
      stripe_charge_id: payload.stripe_charge_id,
      stripe_account_id: payload.stripe_account_id,
    });
  });

  Event.listen(InvoicePaid, async (payload) => {
    const { invoice_id, organization_id } = payload;

    logger.info('InvoicePaid listener: enqueueing metered usage for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });

    // 1. Invoice processing fee (1 unit per paid invoice)
    await addMeteredUsageJob({
      organizationId: organization_id,
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: invoice_id,
    });

    // 2. Payout fee — use the persisted payout transaction as the single
    //    Source of truth so listener retries and refund credits stay aligned.
    const meteredFeeCents = await loadRequiredPayoutMeteredFeeCents(invoice_id);

    if (meteredFeeCents > 0) {
      await addMeteredUsageJob({
        organizationId: organization_id,
        meteredType: METERED_TYPES.PAYOUT_FEE,
        quantity: meteredFeeCents,
        deduplicationId: `payout:${invoice_id}`,
      });
    }

    logger.info('Metered usage jobs queued for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });
  });

  Event.listen(InvoiceRefunded, async (payload) => {
    const { organization_id, payout_fee_credit_cents, credit_invoice_fee, refund_request_id } = payload;

    if (credit_invoice_fee) {
      await addMeteredUsageJob({
        organizationId: organization_id,
        meteredType: METERED_TYPES.INVOICE_FEE,
        quantity: -1,
        deduplicationId: `refund:${refund_request_id}:invoice_fee`,
      });
    }

    if (payout_fee_credit_cents > 0) {
      await addMeteredUsageJob({
        organizationId: organization_id,
        meteredType: METERED_TYPES.PAYOUT_FEE,
        quantity: -payout_fee_credit_cents,
        deduplicationId: `refund:${refund_request_id}:payout_fee`,
      });
    }
  });

  logger.info('Invoices event listeners registered');
};
