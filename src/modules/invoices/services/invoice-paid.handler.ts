/**
 * Invoice Paid Handler
 *
 * Handles invoice.paid event. Complex business logic:
 * - Fund routing to destination accounts
 * - Trust ledger updates for retainer deposits/withdrawals
 * - Metered usage reporting
 * - Retainer balance thresholds
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';
import { trustService } from '@/modules/trust/services/trust.service';
import { trustTransactionsRepository } from '@/modules/trust/database/queries/trust-transactions.queries';
import { db } from '@/shared/database';
import { InvoicePaid, RetainerLowBalance } from '@/shared/events/definitions';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'paid-handler']);

type MatterWithClient = NonNullable<Awaited<ReturnType<typeof mattersQueries.findMatterById>>> & { client_id: string };

/**
 * Sync retainer balance for a matter after a trust ledger transaction
 *
 * Shared helper to avoid duplication between deposit and withdrawal branches.
 * Performs:
 * - Matter lookup and validation
 * - Trust ledger recording (via provided recordFn)
 * - Denormalized balance cache update
 * - Low balance threshold check and event dispatch
 *
 * @param invoice - Internal invoice record
 * @param stripeInvoice - Stripe invoice object
 * @param matterId - Matter UUID
 * @param tx - Database transaction
 * @param recordFn - Function to record deposit or withdrawal in trust ledger (receives matter for client_id)
 */
const syncRetainerBalanceForMatter = async (
  invoice: NonNullable<Awaited<ReturnType<typeof invoicesRepository.findInvoiceByStripeId>>>,
  stripeInvoice: Stripe.Invoice,
  matterId: string,
  tx: typeof db,
  recordFn: (tx: typeof db, matter: MatterWithClient) => Promise<{ success: boolean; error?: { message: string } }>
): Promise<void> => {
  // Get matter to access client_id for trust ledger
  const matter = await mattersQueries.findMatterById(matterId, tx);
  if (!matter) {
    throw new Error(`Matter ${matterId} not found: cannot process retainer update without matter record`);
  }
  if (!matter.client_id) {
    throw new Error(
      `Missing client_id for matter ${matter.id}: cannot process retainer update without trust ledger entry`
    );
  }

  // Cast to MatterWithClient since we've verified client_id is non-null
  const matterWithClient = matter as MatterWithClient;

  // Record in trust ledger (source of truth)
  const result = await recordFn(tx, matterWithClient);
  if (!result.success) {
    logger.error('Failed to record trust transaction for invoice {invoiceId}: {error}', {
      invoiceId: invoice.id,
      matterId,
      organizationId: invoice.organization_id,
      error: result.error?.message ?? 'Unknown error',
    });
    throw new Error('Failed to record trust transaction');
  }

  // Sync denormalized cache from ledger balance
  const balanceRows = await trustTransactionsRepository.getLatestBalanceByClient(
    invoice.organization_id,
    matter.client_id,
    tx
  );
  const matterBalance = balanceRows.find((m) => m.matter_id === matterId)?.balance ?? 0;
  await mattersQueries.updateRetainerBalance(matterId, matterBalance, tx);

  // Check low balance threshold
  if (
    matter.retainer_low_balance_threshold !== null &&
    matter.retainer_low_balance_threshold > 0 &&
    matterBalance < matter.retainer_low_balance_threshold
  ) {
    await RetainerLowBalance.dispatch(
      {
        matter_id: matter.id,
        organization_id: matter.organization_id,
        current_balance: matterBalance,
        threshold: matter.retainer_low_balance_threshold,
      },
      {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      }
    );
  }
};

/**
 * Handle invoice.paid event
 *
 * This is the main revenue event handler. It:
 * 1. Updates invoice status in database
 * 2. Routes funds to appropriate destination accounts
 * 3. Records billing transactions
 * 4. Handles retainer deposits/withdrawals
 * 5. Reports metered usage
 * 6. Emits payment events
 */
export const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
      return;
    }

    let pendingBillingTransactionId: string | null = null;
    let transferDestination: string | null = null;
    let transferMetadata: Stripe.MetadataParam | null = null;

    await db.transaction(async (tx) => {
      // Idempotency check inside transaction with row lock to prevent race conditions
      const lockedInvoice = await invoicesRepository.findInvoiceByStripeIdWithLock(stripeInvoice.id, tx);
      if (!lockedInvoice) {
        throw new Error(`Invoice not found for Stripe ID: ${stripeInvoice.id}`);
      }
      if (lockedInvoice.status === 'paid') {
        logger.info('Invoice {invoiceId} already paid, skipping duplicate processing', {
          invoiceId: lockedInvoice.id,
        });
        return;
      }

      // Safe to use invoice here - we verified it exists above
      const safeInvoice = invoice;

      await invoicesRepository.updateInvoice(
        safeInvoice.id,
        safeInvoice.organization_id,
        {
          status: 'paid',
          amount_paid: stripeInvoice.amount_paid,
          amount_due: stripeInvoice.amount_remaining,
          paid_at: stripeInvoice.status_transitions.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : null,
        },
        tx
      );

      let chargeId: string | null = null;
      if ('charge' in stripeInvoice && typeof stripeInvoice.charge === 'string') {
        chargeId = stripeInvoice.charge;
      }

      let destinationAccountId = safeInvoice.connected_account_id;
      if (stripeInvoice.on_behalf_of) {
        destinationAccountId =
          typeof stripeInvoice.on_behalf_of === 'string' ? stripeInvoice.on_behalf_of : stripeInvoice.on_behalf_of.id;
      }

      // 1. Determine fund routing based on invoice type
      const routingResult = fundRouterService.routePayment(safeInvoice, destinationAccountId);

      if (!routingResult.success) {
        logger.warn('Fund routing failed for invoice {invoiceId}: {error}', {
          invoiceId: safeInvoice.id,
          error: routingResult.error.message,
        });
        throw new Error('Fund routing failed');
      }

      const routingInstruction = routingResult.data;

      // 2. Persist billing transaction and prepare transfer (skip for retainer-funded invoices)
      // Retainer payments don't involve external transfers - funds come from trust ledger
      if (!safeInvoice.payment_from_retainer) {
        const pendingTransaction = await billingTransactionsRepository.createTransaction(
          {
            organization_id: safeInvoice.organization_id,
            invoice_id: safeInvoice.id,
            matter_id: safeInvoice.matter_id,
            amount: stripeInvoice.amount_paid,
            type: 'payout',
            status: 'pending',
            destination_account_id: routingInstruction.destination,
            stripe_transfer_id: null,
            completed_at: null,
            metadata: {
              stripe_invoice_id: stripeInvoice.id,
              stripe_charge_id: chargeId,
              invoice_type: safeInvoice.invoice_type,
              fund_destination: routingInstruction.metadata.fund_destination,
              hold_for_approval: routingInstruction.holdForApproval,
            },
          },
          tx
        );

        pendingBillingTransactionId = pendingTransaction.id;

        if (routingInstruction.holdForApproval) {
          logger.info(
            'Transfer held for approval for invoice {invoiceId}; pending billing transaction {transactionId}',
            {
              invoiceId: safeInvoice.id,
              transactionId: pendingTransaction.id,
            }
          );
        } else {
          transferDestination = routingInstruction.destination;
          transferMetadata = routingInstruction.metadata;
        }
      }

      // 4. Handle retainer transactions (if applicable)
      if (safeInvoice.matter_id && routingInstruction.updateRetainerBalance) {
        // Record retainer deposit and sync balance
        await syncRetainerBalanceForMatter(
          safeInvoice,
          stripeInvoice,
          safeInvoice.matter_id,
          tx,
          async (tx, matter) => {
            return await trustService.recordDeposit(
              {
                organizationId: safeInvoice.organization_id,
                clientId: matter.client_id,
                matterId: safeInvoice.matter_id,
                amount: stripeInvoice.amount_paid,
                invoiceId: safeInvoice.id,
                stripePaymentIntentId: safeInvoice.stripe_payment_intent_id,
                source: 'stripe_payment',
                description: `Retainer deposit — invoice ${safeInvoice.invoice_number ?? safeInvoice.id}`,
                createdBy: 'webhook',
              },
              tx
            );
          }
        );
      } else if (safeInvoice.matter_id && safeInvoice.payment_from_retainer) {
        // Record retainer withdrawal and sync balance
        await syncRetainerBalanceForMatter(
          safeInvoice,
          stripeInvoice,
          safeInvoice.matter_id,
          tx,
          async (tx, matter) => {
            return await trustService.recordWithdrawal(
              {
                organizationId: safeInvoice.organization_id,
                clientId: matter.client_id,
                matterId: safeInvoice.matter_id,
                amount: stripeInvoice.amount_paid,
                invoiceId: safeInvoice.id,
                stripePaymentIntentId: safeInvoice.stripe_payment_intent_id,
                source: 'invoice_payment',
                description: `Invoice payment from retainer — invoice ${safeInvoice.invoice_number ?? safeInvoice.id}`,
                createdBy: 'webhook',
              },
              tx
            );
          }
        );
      }

      await InvoicePaid.dispatch(
        {
          invoice_id: safeInvoice.id,
          organization_id: safeInvoice.organization_id,
          matter_id: safeInvoice.matter_id,
          stripe_invoice_id: stripeInvoice.id,
          amount_paid: stripeInvoice.amount_paid,
          retainer_deducted: Boolean(safeInvoice.payment_from_retainer),
          retainer_amount_deducted: safeInvoice.payment_from_retainer ? stripeInvoice.amount_paid : undefined,
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: safeInvoice.organization_id,
          tx,
          critical: true,
        }
      );
    });

    // 5. Record metered usage for platform fee (after transaction commits to avoid over-reporting)
    // Best-effort: subscription-billing outages should not block fund movement
    try {
      await meteredProductsService.reportMeteredUsage(
        db,
        invoice.organization_id,
        METERED_TYPES.INVOICE_FEE,
        1 // 1 invoice processed
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Metered usage reporting failed for invoice {invoiceId}: {error}', {
        invoiceId: invoice.id,
        organizationId: invoice.organization_id,
        meteredType: METERED_TYPES.INVOICE_FEE,
        error: message,
      });
      // Continue execution - metering failure should not block payout
    }

    if (pendingBillingTransactionId && transferDestination && transferMetadata) {
      try {
        const transfer = await stripe.transfers.create({
          amount: stripeInvoice.amount_paid,
          currency: stripeInvoice.currency,
          destination: transferDestination,
          metadata: transferMetadata,
        });

        await billingTransactionsRepository.updateTransactionStatus(pendingBillingTransactionId, 'completed', {
          stripe_transfer_id: transfer.id,
          completed_at: stripeInvoice.status_transitions.paid_at
            ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
            : new Date(),
          last_error: null,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create transfer';

        await billingTransactionsRepository.updateTransactionStatus(pendingBillingTransactionId, 'failed', {
          last_error: message,
        });

        throw error;
      }
    }

    logger.info('✅ Invoice {invoiceId} marked as paid', { invoiceId: invoice.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.paid {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    throw new Error('Failed to handle invoice.paid webhook', { cause: error });
  }
};
