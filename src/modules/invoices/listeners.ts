/**
 * Invoices Module Event Listeners
 *
 * Handles invoice-related events that need post-processing after the
 * webhook handler has already acknowledged with 2xx. Metered usage
 * reporting is a natural fit here: the InvoicePaid event is dispatched
 * transactionally inside the webhook handler, so the outbox worker picks
 * it up asynchronously, with full retry + dead-letter support, without
 * blocking Stripe's webhook timeout window.
 */

import { getLogger } from '@logtape/logtape';
import { InvoicePaid } from '@/shared/events/definitions';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';
import { db } from '@/shared/database';
import { Event } from '@/shared/events/event';

const logger = getLogger(['invoices', 'listeners']);

/**
 * Register all invoice event listeners.
 *
 * These run inside the outbox worker (process-outbox-event task) with the
 * system's built-in 5-retry / dead-letter guarantees — no hand-rolled
 * sleep() or backoff is required here.
 */
export function registerInvoicesListeners(): void {
  logger.info('Registering invoices event listeners...');

  /**
   * On invoice.paid: report metered usage for the invoice processing fee
   * (1 unit) and, if the payout fee amount is present in the context
   * record's metadata, for the payout fee as well.
   *
   * Note: the payout fee in cents is stored as metadata on the event
   * record by the webhook handler so the listener can access it without
   * an extra DB round-trip.
   */
  Event.listen(InvoicePaid, async (payload, context) => {
    const { invoice_id, organization_id, amount_paid } = payload;

    logger.info('InvoicePaid listener: reporting metered usage for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });

    // 1. Invoice processing fee (1 unit per paid invoice)
    const invoiceFeeResult = await meteredProductsService.reportMeteredUsage(
      db,
      organization_id,
      METERED_TYPES.INVOICE_FEE,
      1,
      invoice_id // idempotency key — invoice_id is stable and unique per payment
    );

    if (!invoiceFeeResult.success) {
      logger.error('Failed to report invoice fee usage for invoice {invoiceId}: {error}', {
        invoiceId: invoice_id,
        error: invoiceFeeResult.error.message,
      });
      // Throwing here causes the outbox worker to retry the event (up to 5 times)
      // and move it to events_dead_letter on final failure — no data is dropped.
      throw new Error(`Invoice fee metered usage failed: ${invoiceFeeResult.error.message}`);
    }

    // 2. Payout fee — amount_paid carries the gross payout cents; the
    //    per-event metered fee (Stripe fee + platform variable fee) is
    //    stored in context.metadata.metered_fee_cents if available.
    //    Fall back to the variable-only estimate when metadata is absent.
    const PLATFORM_VARIABLE_FEE_RATE = 0.01337;
    const meteredFeeCents: number =
      typeof payload.metered_fee_cents === 'number'
        ? payload.metered_fee_cents
        : Math.round(amount_paid * PLATFORM_VARIABLE_FEE_RATE);

    if (meteredFeeCents > 0) {
      const payoutFeeResult = await meteredProductsService.reportMeteredUsage(
        db,
        organization_id,
        METERED_TYPES.PAYOUT_FEE,
        meteredFeeCents,
        `payout:${invoice_id}` // distinct dedupe key from the invoice-fee key above
      );

      if (!payoutFeeResult.success) {
        logger.error('Failed to report payout fee usage for invoice {invoiceId}: {error}', {
          invoiceId: invoice_id,
          error: payoutFeeResult.error.message,
        });
        throw new Error(`Payout fee metered usage failed: ${payoutFeeResult.error.message}`);
      }
    }

    logger.info('Metered usage reported successfully for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });
  });

  logger.info('Invoices event listeners registered');
}
