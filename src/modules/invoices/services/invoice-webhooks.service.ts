import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { meteredProductsService } from '@/modules/subscriptions/services/meteredProducts.service';
import { db } from '@/shared/database';
import {
  InvoicePaid,
  InvoicePaymentFailed,
  InvoiceVoided,
  InvoiceDeleted,
} from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'webhooks-service']);


/**
 * Handle invoice.paid event
 */
const handleInvoicePaid = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      logger.warn('Invoice not found for Stripe ID: {stripeInvoiceId}', { stripeInvoiceId: stripeInvoice.id });
      return result.ok(undefined);
    }

    // --- PHASE 1: PRE-CALCULATION & DB OPS ---

    let destinationAccountId = invoice.connected_account_id;
    if (stripeInvoice.on_behalf_of) {
      destinationAccountId = typeof stripeInvoice.on_behalf_of === 'string'
        ? stripeInvoice.on_behalf_of
        : stripeInvoice.on_behalf_of.id;
    }

    // 1. Determine fund routing (Logic only)
    const routingResult = fundRouterService.routePayment(
      invoice,
      destinationAccountId,
    );

    if (!routingResult.success) {
      logger.warn('Fund routing failed for invoice {invoiceId}: {error}', {
        invoiceId: invoice.id,
        error: routingResult.error.message,
      });
      return result.internalError('Fund routing failed');
    }

    const routingInstruction = routingResult.data;
    let billingTxId: string | null = null;

    // 2. DB Transaction for status update & pending record
    await db.transaction(async (tx) => {
      // Idempotent: Only update if not already paid
      if (invoice.status !== 'paid') {
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
          tx,
        );

        // Record metered usage for platform fee
        await meteredProductsService.reportMeteredUsage(
          tx,
          invoice.organization_id,
          METERED_TYPES.INVOICE_FEE,
          1, // 1 invoice processed
        );

        // Update retainer balance (if applicable)
        if (invoice.matter_id && routingInstruction.updateRetainerBalance) {
          const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
          if (matter) {
            const newBalance = matter.retainer_balance + stripeInvoice.amount_paid;
            logger.info('Incrementing retainer balance for matter {matterId} (deposit): {oldBalance} -> {newBalance}', {
              matterId: invoice.matter_id,
              oldBalance: matter.retainer_balance,
              newBalance,
            });
            await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
          }
        } else if (invoice.matter_id && invoice.payment_from_retainer) {
          // Handle payment from retainer (decrement balance)
          const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
          if (matter) {
            const newBalance = Math.max(0, matter.retainer_balance - stripeInvoice.amount_paid);
            logger.info('Decrementing retainer balance for matter {matterId} (payment): {oldBalance} -> {newBalance}', {
              matterId: invoice.matter_id,
              oldBalance: matter.retainer_balance,
              newBalance,
            });
            await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
          }
        }

        // Dispatch events
        await InvoicePaid.dispatch({
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          matter_id: invoice.matter_id,
          stripe_invoice_id: stripeInvoice.id,
          amount_paid: stripeInvoice.amount_paid,
          retainer_deducted: !!invoice.payment_from_retainer,
          retainer_amount_deducted: invoice.payment_from_retainer ? stripeInvoice.amount_paid : undefined,
        }, {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
          critical: true,
        });
      }

      // 3. Handle Billing Transaction (Payout)
      if (!routingInstruction.holdForApproval) {
        // Check if transaction already exists (Idempotency)
        const existingTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id, tx);
        const payoutTx = existingTxs.find(t => t.type === 'payout');

        if (payoutTx) {
          if (payoutTx.status === 'completed') {
            billingTxId = null; // Already done
          } else {
            billingTxId = payoutTx.id;
          }
        } else {
          // Create "pending" transaction
          let charge_id: string | null = null;
          if ('charge' in stripeInvoice && typeof stripeInvoice.charge === 'string') {
            charge_id = stripeInvoice.charge;
          }

          const newTx = await billingTransactionsRepository.createTransaction({
            invoice_id: invoice.id,
            matter_id: invoice.matter_id,
            amount: stripeInvoice.amount_paid,
            type: 'payout',
            status: 'pending',
            destination_account_id: destinationAccountId,
            completed_at: stripeInvoice.status_transitions.paid_at
              ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
              : null,
            metadata: {
              stripe_invoice_id: stripeInvoice.id,
              stripe_charge_id: charge_id,
              invoice_type: invoice.invoice_type,
              fund_destination: routingInstruction.metadata.fund_destination,
            },
          }, tx);
          billingTxId = newTx.id;
        }
      }
    });

    // --- PHASE 2: EXTERNAL API CALL ---

    if (billingTxId && routingInstruction) {
      logger.info('Creating Stripe transfer for invoice {invoiceId}', { invoiceId: invoice.id });

      const transfer = await stripe.transfers.create({
        amount: stripeInvoice.amount_paid,
        currency: 'usd',
        destination: routingInstruction.destination,
        metadata: routingInstruction.metadata,
      });

      logger.info('Created Stripe transfer {transferId} for invoice {invoiceId}', {
        transferId: transfer.id,
        invoiceId: invoice.id,
      });

      // --- PHASE 3: FINAL DB UPDATE ---

      await billingTransactionsRepository.updateTransactionStatus(billingTxId, 'completed', {
        stripe_transfer_id: transfer.id,
      });
    }

    logger.info('✅ Invoice {invoiceId} marked as paid', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.paid {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    // Throw error so Graphile worker retries
    throw error;
  }
};

/**
 * Handle invoice.payment_failed event
 */
const handleInvoicePaymentFailed = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) return result.ok(undefined);

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'overdue',
        },
        tx,
      );

      await InvoicePaymentFailed.dispatch({
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        stripe_invoice_id: stripeInvoice.id,
      }, {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      });
    });

    logger.info('❌ Payment failed for invoice {invoiceId}', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.payment_failed {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    throw error;
  }
};

/**
 * Handle invoice.voided event
 */
const handleInvoiceVoided = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) return result.ok(undefined);

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'cancelled',
        },
        tx,
      );

      await InvoiceVoided.dispatch({
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        stripe_invoice_id: stripeInvoice.id,
        voided_by: 'webhook',
      }, {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      });
    });

    logger.info('🚫 Invoice {invoiceId} voided', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.voided {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    throw error;
  }
};

/**
 * Handle invoice.deleted event (for draft invoices)
 */
const handleInvoiceDeleted = async (stripeInvoice: Stripe.Invoice): Promise<Result<void>> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) return result.ok(undefined);

    await db.transaction(async (tx) => {
      await invoicesRepository.softDeleteInvoice(
        invoice.id,
        invoice.organization_id,
        null,
        tx,
      );

      await InvoiceDeleted.dispatch({
        invoice_id: invoice.id,
        organization_id: invoice.organization_id,
        deleted_by: 'webhook',
      }, {
        actorId: 'webhook',
        actorType: 'webhook',
        organizationId: invoice.organization_id,
        tx,
      });
    });

    logger.info('🗑️ Invoice {invoiceId} deleted via Stripe', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.deleted {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    throw error;
  }
};

/**
 * Type guard for Stripe Invoice
 */
function isStripeInvoice(obj: unknown): obj is Stripe.Invoice {
  return !!obj && typeof obj === 'object' && 'object' in obj && obj.object === 'invoice';
}

/**
 * Process a Stripe invoice event
 */
const processEvent = async (event: Stripe.Event): Promise<Result<void>> => {
  const eventType = event.type;
  const stripeInvoice = event.data.object;

  if (!isStripeInvoice(stripeInvoice)) {
    logger.warn('Received Stripe event without invoice object: {eventType}', { eventType });
    return result.ok(undefined);
  }

  logger.info('Processing invoice webhook event {eventType} for Stripe Invoice {stripeInvoiceId}', {
    eventType,
    stripeInvoiceId: stripeInvoice.id,
  });

  switch (eventType) {
    case 'invoice.paid':
      return await handleInvoicePaid(stripeInvoice);
    case 'invoice.payment_failed':
      return await handleInvoicePaymentFailed(stripeInvoice);
    case 'invoice.voided':
      return await handleInvoiceVoided(stripeInvoice);
    case 'invoice.deleted':
      return await handleInvoiceDeleted(stripeInvoice);
    default:
      logger.info('Unhandled invoice event type: {eventType}', { eventType });
      return result.ok(undefined);
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

