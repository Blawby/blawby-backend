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

    // Idempotency: Skip if invoice already marked as paid (webhook retry)
    if (invoice.status === 'paid') {
      logger.info('Invoice {invoiceId} already paid, skipping duplicate processing', {
        invoiceId: invoice.id,
      });
      return;
    }

    let pendingBillingTransactionId: string | null = null;
    let transferDestination: string | null = null;
    let transferMetadata: Stripe.MetadataParam | null = null;

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
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

      let charge_id: string | null = null;
      if ('charge' in stripeInvoice && typeof stripeInvoice.charge === 'string') {
        charge_id = stripeInvoice.charge;
      }

      let destinationAccountId = invoice.connected_account_id;
      if (stripeInvoice.on_behalf_of) {
        destinationAccountId =
          typeof stripeInvoice.on_behalf_of === 'string' ? stripeInvoice.on_behalf_of : stripeInvoice.on_behalf_of.id;
      }

      // 1. Determine fund routing based on invoice type
      const routingResult = fundRouterService.routePayment(invoice, destinationAccountId);

      if (!routingResult.success) {
        logger.warn('Fund routing failed for invoice {invoiceId}: {error}', {
          invoiceId: invoice.id,
          error: routingResult.error.message,
        });
        throw new Error('Fund routing failed');
      }

      const routingInstruction = routingResult.data;

      // 2. Persist billing transaction first (pending), then execute external transfer after commit
      const pendingTransaction = await billingTransactionsRepository.createTransaction(
        {
          organization_id: invoice.organization_id,
          invoice_id: invoice.id,
          matter_id: invoice.matter_id,
          amount: stripeInvoice.amount_paid,
          type: 'payout',
          status: 'pending',
          destination_account_id: routingInstruction.destination,
          stripe_transfer_id: null,
          completed_at: null,
          metadata: {
            stripe_invoice_id: stripeInvoice.id,
            stripe_charge_id: charge_id,
            invoice_type: invoice.invoice_type,
            fund_destination: routingInstruction.metadata.fund_destination,
            hold_for_approval: routingInstruction.holdForApproval,
          },
        },
        tx
      );

      pendingBillingTransactionId = pendingTransaction.id;

      if (routingInstruction.holdForApproval) {
        logger.info('Transfer held for approval for invoice {invoiceId}; pending billing transaction {transactionId}', {
          invoiceId: invoice.id,
          transactionId: pendingTransaction.id,
        });
      } else {
        transferDestination = routingInstruction.destination;
        transferMetadata = routingInstruction.metadata;
      }

      // 4. Handle retainer transactions (if applicable)
      if (invoice.matter_id && routingInstruction.updateRetainerBalance) {
        // Get matter to access client_id for trust ledger
        const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
        if (matter?.client_id) {
          // 4a. Record in trust ledger (source of truth)
          const depositResult = await trustService.recordDeposit(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
              matterId: invoice.matter_id,
              amount: stripeInvoice.amount_paid,
              invoiceId: invoice.id,
              stripePaymentIntentId: invoice.stripe_payment_intent_id,
              source: 'stripe_payment',
              description: `Retainer deposit — invoice ${invoice.invoice_number ?? invoice.id}`,
              createdBy: 'webhook',
            },
            tx
          );

          if (!depositResult.success) {
            logger.error('Failed to record trust deposit for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: depositResult.error.message,
            });
            throw new Error('Failed to record trust deposit');
          }

          // 4b. Sync denormalized cache from ledger balance
          const balanceRows = await trustTransactionsRepository.getLatestBalanceByClient(
            invoice.organization_id,
            matter.client_id,
            tx
          );
          const matterBalance = balanceRows.find((m) => m.matter_id === invoice.matter_id)?.balance ?? 0;
          await mattersQueries.updateRetainerBalance(invoice.matter_id, matterBalance, tx);

          // 4c. Check low balance threshold
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
                critical: true,
              }
            );
          }
        } else if (matter) {
          throw new Error(
            `Missing client_id for matter ${matter.id}: cannot process retainer updateRetainerBalance without trust ledger entry`
          );
        }
      } else if (invoice.matter_id && invoice.payment_from_retainer) {
        // Handle payment from retainer (decrement balance)
        const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
        if (matter?.client_id) {
          // Record withdrawal in trust ledger
          const withdrawalResult = await trustService.recordWithdrawal(
            {
              organizationId: invoice.organization_id,
              clientId: matter.client_id,
              matterId: invoice.matter_id,
              amount: stripeInvoice.amount_paid,
              invoiceId: invoice.id,
              stripePaymentIntentId: invoice.stripe_payment_intent_id,
              source: 'invoice_payment',
              description: `Invoice payment from retainer — invoice ${invoice.invoice_number ?? invoice.id}`,
              createdBy: 'webhook',
            },
            tx
          );

          if (!withdrawalResult.success) {
            logger.error('Failed to record trust withdrawal for invoice {invoiceId}: {error}', {
              invoiceId: invoice.id,
              matterId: invoice.matter_id,
              organizationId: invoice.organization_id,
              error: withdrawalResult.error.message,
            });
            throw new Error('Failed to record trust withdrawal');
          }

          // Sync denormalized cache from ledger balance
          const balanceRows = await trustTransactionsRepository.getLatestBalanceByClient(
            invoice.organization_id,
            matter.client_id,
            tx
          );
          const matterBalance = balanceRows.find((m) => m.matter_id === invoice.matter_id)?.balance ?? 0;
          await mattersQueries.updateRetainerBalance(invoice.matter_id, matterBalance, tx);

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
                critical: true,
              }
            );
          }
        } else if (matter) {
          throw new Error(
            `Missing client_id for matter ${matter.id}: cannot process retainer withdrawal without trust ledger entry`
          );
        }
      }

      // 5. Record metered usage for platform fee
      await meteredProductsService.reportMeteredUsage(
        tx,
        invoice.organization_id,
        METERED_TYPES.INVOICE_FEE,
        1 // 1 invoice processed
      );

      await InvoicePaid.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          matter_id: invoice.matter_id,
          stripe_invoice_id: stripeInvoice.id,
          amount_paid: stripeInvoice.amount_paid,
          retainer_deducted: Boolean(invoice.payment_from_retainer),
          retainer_amount_deducted: invoice.payment_from_retainer ? stripeInvoice.amount_paid : undefined,
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
          critical: true,
        }
      );
    });

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
