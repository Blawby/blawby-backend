/**
 * Invoices Module Event Listeners
 *
 * Handles invoice-related events that need post-processing after the
 * webhook handler has already acknowledged with 2xx. Metered usage
 * reporting is a natural fit here: the InvoicePaid event is dispatched
 * transactionally inside the webhook handler, so the outbox worker picks
 * it up asynchronously. Stripe meter failures are converted into dedicated
 * Graphile retry jobs so payment flow remains non-blocking.
 */

import { getLogger } from '@logtape/logtape';
import { loadRequiredPayoutMeteredFeeCents } from '@/modules/invoices/services/payout-metered-fee.service';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';
import { db } from '@/shared/database';
import { InvoicePaid, InvoiceRefunded, SystemErrorOccurred } from '@/shared/events/definitions';
import { Event } from '@/shared/events/event';
import { addMeteredUsageJob } from '@/shared/queue/queue.manager';

const logger = getLogger(['invoices', 'listeners']);

export const reportMeteredUsageWithRetry = async (
  opts: {
    organizationId: string;
    meteredType: (typeof METERED_TYPES)[keyof typeof METERED_TYPES];
    quantity: number;
    deduplicationId: string;
    invoiceId: string;
    failureLabel: string;
  },
  deps: {
    reportMeteredUsage: typeof meteredProductsService.reportMeteredUsage;
    queueMeteredUsageJob: typeof addMeteredUsageJob;
    dispatchSystemError: (
      payload: {
        error: string;
        context: Record<string, unknown>;
      },
      options: {
        actorId: 'system';
        actorType: 'system';
        organizationId: string;
        critical: true;
      }
    ) => string | Promise<string>;
  } = {
    reportMeteredUsage: meteredProductsService.reportMeteredUsage.bind(meteredProductsService),
    queueMeteredUsageJob: addMeteredUsageJob,
    dispatchSystemError: (payload, options) => SystemErrorOccurred.dispatch(payload, options),
  }
): Promise<void> => {
  const usageResult = await deps.reportMeteredUsage(
    db,
    opts.organizationId,
    opts.meteredType,
    opts.quantity,
    opts.deduplicationId
  );

  if (usageResult.success) {
    return;
  }

  logger.error('Failed to report {failureLabel} for invoice {invoiceId}: {error}', {
    failureLabel: opts.failureLabel,
    invoiceId: opts.invoiceId,
    error: usageResult.error.message,
  });

  try {
    await deps.queueMeteredUsageJob({
      organizationId: opts.organizationId,
      meteredType: opts.meteredType,
      quantity: opts.quantity,
      deduplicationId: opts.deduplicationId,
    });

    logger.warn('Queued metered usage retry for {failureLabel} on invoice {invoiceId}', {
      failureLabel: opts.failureLabel,
      invoiceId: opts.invoiceId,
      deduplicationId: opts.deduplicationId,
    });
  } catch (queueError) {
    let dispatchErrorMessage: string | null = null;

    logger.error('Failed to queue metered usage retry for invoice {invoiceId}: {error}', {
      invoiceId: opts.invoiceId,
      error: queueError instanceof Error ? queueError.message : 'Unknown error',
      deduplicationId: opts.deduplicationId,
    });

    try {
      await deps.dispatchSystemError(
        {
          error: 'Failed to report metered usage and failed to queue retry',
          context: {
            organizationId: opts.organizationId,
            invoiceId: opts.invoiceId,
            meteredType: opts.meteredType,
            quantity: opts.quantity,
            deduplicationId: opts.deduplicationId,
            failureLabel: opts.failureLabel,
            meteredError: usageResult.error.message,
            queueError: queueError instanceof Error ? queueError.message : 'Unknown error',
          },
        },
        {
          actorId: 'system',
          actorType: 'system',
          organizationId: opts.organizationId,
          critical: true,
        }
      );
    } catch (dispatchError) {
      dispatchErrorMessage = dispatchError instanceof Error ? dispatchError.message : 'Unknown error';
      logger.error('Failed to dispatch SystemErrorOccurred for invoice {invoiceId}: {error}', {
        invoiceId: opts.invoiceId,
        error: dispatchErrorMessage,
      });
    }

    if (dispatchErrorMessage) {
      throw new Error(
        `Failed to queue metered usage retry (${queueError instanceof Error ? queueError.message : 'Unknown error'}); ` +
          `failed to dispatch SystemErrorOccurred (${dispatchErrorMessage})`,
        { cause: queueError }
      );
    }

    throw queueError instanceof Error ? queueError : new Error('Failed to queue metered usage retry');
  }
};

/**
 * Register all invoice event listeners.
 *
 * These run inside the outbox worker (process-outbox-event task). Meter
 * reporting failures are re-queued onto Graphile Worker with job-key
 * deduplication instead of sleeping or retrying inline.
 */
export function registerInvoicesListeners(): void {
  logger.info('Registering invoices event listeners...');

  /**
   * On invoice.paid: report metered usage for the invoice processing fee
   * (1 unit) and, if the payout fee amount is present in the context
   * record's metadata, for the payout fee as well.
   *
   * Note: payout-fee metering is rebuilt from the persisted payout
   * transaction so retries stay consistent with later refund credits.
   */
  Event.listen(InvoicePaid, async (payload) => {
    const { invoice_id, organization_id } = payload;

    logger.info('InvoicePaid listener: reporting metered usage for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });

    // 1. Invoice processing fee (1 unit per paid invoice)
    await reportMeteredUsageWithRetry({
      organizationId: organization_id,
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: invoice_id,
      invoiceId: invoice_id,
      failureLabel: 'invoice fee usage',
    });

    // 2. Payout fee — use the persisted payout transaction as the single
    //    Source of truth so listener retries and refund credits stay aligned.
    const meteredFeeCents = await loadRequiredPayoutMeteredFeeCents(invoice_id);

    if (meteredFeeCents > 0) {
      await reportMeteredUsageWithRetry({
        organizationId: organization_id,
        meteredType: METERED_TYPES.PAYOUT_FEE,
        quantity: meteredFeeCents,
        deduplicationId: `payout:${invoice_id}`,
        invoiceId: invoice_id,
        failureLabel: 'payout fee usage',
      });
    }

    logger.info('Metered usage reported successfully for invoice {invoiceId}', {
      invoiceId: invoice_id,
    });
  });

  Event.listen(InvoiceRefunded, async (payload) => {
    const { invoice_id, organization_id, payout_fee_credit_cents, credit_invoice_fee, refund_request_id } = payload;

    if (credit_invoice_fee) {
      await reportMeteredUsageWithRetry({
        organizationId: organization_id,
        meteredType: METERED_TYPES.INVOICE_FEE,
        quantity: -1,
        deduplicationId: `refund:${refund_request_id}:invoice_fee`,
        invoiceId: invoice_id,
        failureLabel: 'invoice fee credit',
      });
    }

    if (payout_fee_credit_cents > 0) {
      await reportMeteredUsageWithRetry({
        organizationId: organization_id,
        meteredType: METERED_TYPES.PAYOUT_FEE,
        quantity: -payout_fee_credit_cents,
        deduplicationId: `refund:${refund_request_id}:payout_fee`,
        invoiceId: invoice_id,
        failureLabel: 'payout fee credit',
      });
    }
  });

  logger.info('Invoices event listeners registered');
}
