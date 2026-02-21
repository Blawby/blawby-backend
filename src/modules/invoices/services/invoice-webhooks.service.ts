import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { fundRouterService } from '@/modules/invoices/services/fund-router.service';
import type { TransferInstruction } from '@/modules/invoices/services/fund-router.service';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
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
 * PHASE 1: Determine fund routing and destination account
 */
const handlePhase1Routing = async (
  invoice: InvoiceWithRelations,
  stripeInvoice: Stripe.Invoice,
): Promise<Result<{ routingInstruction: TransferInstruction; destinationAccountId: string }>> => {
  let destinationAccountId = invoice.connectedAccount?.stripe_account_id;
  if (stripeInvoice.on_behalf_of) {
    destinationAccountId = typeof stripeInvoice.on_behalf_of === 'string'
      ? stripeInvoice.on_behalf_of
      : stripeInvoice.on_behalf_of.id;
  }

  if (!destinationAccountId) {
    logger.warn('Missing Stripe account ID for connected account on invoice {invoiceId}', { invoiceId: invoice.id });
    return result.badRequest('Missing Stripe account ID for connected account');
  }

  const routingResult = fundRouterService.routePayment(
    invoice,
    destinationAccountId,
  );

  if (!routingResult.success) {
    logger.warn('Fund routing failed for invoice {invoiceId}: {error}', {
      invoiceId: invoice.id,
      error: routingResult.error.message,
    });
    return result.fail(
      routingResult.error.message,
      routingResult.error.status,
      routingResult.error.code,
      routingResult.error.details,
    );
  }

  return result.ok({
    routingInstruction: routingResult.data,
    destinationAccountId,
  });
};

/**
 * PHASE 2: Idempotent DB Transaction (Status Update & Payout Record)
 */
const handlePhase2DbTransaction = async (
  invoice: InvoiceWithRelations,
  stripeInvoice: Stripe.Invoice,
  routingInstruction: TransferInstruction,
  destinationAccountId: string,
): Promise<Result<{ billingTxId: string | null; isNewlyPaid: boolean }>> => {
  let billingTxId: string | null = null;
  let isNewlyPaid = false;

  try {
    await db.transaction(async (tx) => {
      // 1. Update invoice status
      if (invoice.status !== 'paid') {
        isNewlyPaid = true;
        await invoicesRepository.updateInvoice(
          invoice.id,
          invoice.organization_id,
          {
            status: 'paid',
            amount_paid: stripeInvoice.amount_paid,
            amount_due: stripeInvoice.amount_remaining,
            application_fee_amount: routingInstruction.applicationFeeAmount,
            paid_at: stripeInvoice.status_transitions.paid_at
              ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
              : null,
          },
          tx,
        );

        // 2. Update retainer balance (if applicable)
        if (invoice.matter_id && routingInstruction.updateRetainerBalance) {
          const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
          if (matter) {
            const newBalance = matter.retainer_balance + stripeInvoice.amount_paid;
            await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
          }
        } else if (invoice.matter_id && invoice.payment_from_retainer) {
          const matter = await mattersQueries.findMatterById(invoice.matter_id, tx);
          if (matter) {
            const newBalance = Math.max(0, matter.retainer_balance - stripeInvoice.amount_paid);
            await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);
          }
        }

        // 3. Dispatch events
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

      // 4. Handle Billing Transaction (Payout)
      if (!routingInstruction.holdForApproval) {
        const existingTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id, tx);
        const payoutTx = existingTxs.find((t) => t.type === 'payout');

        if (payoutTx) {
          // Guard against existing transfer ID or completed status (Idempotency)
          if (payoutTx.stripe_transfer_id || payoutTx.status === 'completed') {
            billingTxId = null;
          } else {
            billingTxId = payoutTx.id;
          }
        } else {
          // Create "pending" transaction
          let chargeId: string | null = null;
          if ('charge' in stripeInvoice && typeof stripeInvoice.charge === 'string') {
            chargeId = stripeInvoice.charge;
          }

          const newTx = await billingTransactionsRepository.createTransaction({
            organization_id: invoice.organization_id,
            invoice_id: invoice.id,
            matter_id: invoice.matter_id,
            amount: stripeInvoice.amount_paid,
            application_fee_amount: routingInstruction.applicationFeeAmount,
            type: 'payout',
            status: 'pending',
            destination_account_id: destinationAccountId,
            completed_at: null, // Payout is pending, set completed_at when transfer succeeds
            metadata: {
              stripe_invoice_id: stripeInvoice.id,
              stripe_charge_id: chargeId,
              invoice_type: invoice.invoice_type,
              fund_destination: routingInstruction.metadata.fund_destination,
              application_fee_amount: routingInstruction.applicationFeeAmount,
            },
          }, tx);
          billingTxId = newTx.id;
        }
      }
    });

    return result.ok({ billingTxId, isNewlyPaid });
  } catch (error) {
    logger.error('Failed Phase 2 DB Transaction for invoice {invoiceId}: {error}', {
      invoiceId: invoice.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Failed to record invoice payment in database');
  }
};

/**
 * PHASE 3: External Stripe Transfer and Final DB Sync
 */
const handlePhase3StripeTransfer = async (
  invoice: InvoiceWithRelations,
  stripeInvoice: Stripe.Invoice,
  routingInstruction: TransferInstruction,
  billingTxId: string,
): Promise<Result<void>> => {
  const transferAmount = stripeInvoice.amount_paid - routingInstruction.applicationFeeAmount;

  if (transferAmount <= 0) {
    logger.info('Skipping Stripe transfer for invoice {invoiceId} because transfer amount is {amount}', {
      invoiceId: invoice.id,
      amount: transferAmount,
    });
    // Still complete the transaction in DB if it was created
    await billingTransactionsRepository.updateTransactionStatus(billingTxId, 'completed', {
      completed_at: new Date(),
    });
    return result.ok(undefined);
  }

  logger.info('Creating Stripe transfer for invoice {invoiceId} of amount {amount}', {
    invoiceId: invoice.id,
    amount: transferAmount,
  });

  try {
    const transfer = await stripe.transfers.create({
      amount: transferAmount,
      currency: stripeInvoice.currency || 'usd',
      destination: routingInstruction.destination,
      metadata: {
        ...routingInstruction.metadata,
        payout_amount: transferAmount.toString(),
      },
    });

    logger.info('Created Stripe transfer {transferId} for invoice {invoiceId}', {
      transferId: transfer.id,
      invoiceId: invoice.id,
    });

    try {
      await billingTransactionsRepository.updateTransactionStatus(billingTxId, 'completed', {
        stripe_transfer_id: transfer.id,
        completed_at: new Date(),
      });

      // Record metered usage for payout fee (Fire & Forget with clean logging)
      meteredProductsService.reportMeteredUsage(
        db,
        invoice.organization_id,
        METERED_TYPES.PAYOUT_FEE,
        1,
        invoice.id, // Stable key for deduplication
      ).catch((err) => {
        logger.error('Failed to report payout metered usage for invoice {invoiceId}, org {organizationId}: {error}', {
          invoiceId: invoice.id,
          organizationId: invoice.organization_id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    } catch (dbError) {
      // Transfer succeeded but DB update failed — record for manual reconciliation
      logger.error('Stripe transfer {transferId} succeeded but DB update failed for billing tx {billingTxId}: {error}', {
        transferId: transfer.id,
        billingTxId,
        error: dbError instanceof Error ? dbError.message : 'Unknown error',
      });

      try {
        await billingTransactionsRepository.updateTransactionStatus(billingTxId, 'pending', {
          stripe_transfer_id: transfer.id,
          last_error: `DB update failed after successful transfer: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`,
        });
      } catch (innerDbError) {
        logger.error('CRITICAL: Failed to update billing tx {billingTxId} with transfer {transferId} details after success: {error}. Original DB error: {originalError}', {
          billingTxId,
          transferId: transfer.id,
          error: innerDbError instanceof Error ? innerDbError.message : 'Unknown error',
          originalError: dbError instanceof Error ? dbError.message : 'Unknown error',
        });
      }
    }
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Stripe transfer for invoice {invoiceId}: {error}', {
      invoiceId: invoice.id,
      error: message,
    });
    return result.internalError('Failed to create Stripe transfer');
  }
};

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

    const phase1 = await handlePhase1Routing(invoice, stripeInvoice);
    if (!phase1.success) return phase1;

    const { routingInstruction, destinationAccountId } = phase1.data;

    const phase2 = await handlePhase2DbTransaction(
      invoice,
      stripeInvoice,
      routingInstruction,
      destinationAccountId,
    );
    if (!phase2.success) return phase2;

    const { billingTxId, isNewlyPaid } = phase2.data;

    // Report invoice fee if newly paid
    if (isNewlyPaid) {
      meteredProductsService.reportMeteredUsage(
        db,
        invoice.organization_id,
        METERED_TYPES.INVOICE_FEE,
        1,
        invoice.id, // Stable key for deduplication
      ).catch((err) => {
        logger.error('Failed to report invoice metered usage for invoice {invoiceId}, org {organizationId}: {error}', {
          invoiceId: invoice.id,
          organizationId: invoice.organization_id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });
    }

    // Phase 3: External Transfer
    if (billingTxId) {
      const phase3 = await handlePhase3StripeTransfer(invoice, stripeInvoice, routingInstruction, billingTxId);
      if (!phase3.success) return phase3;
    }

    logger.info('✅ Invoice {invoiceId} processed in webhook', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.paid {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    return result.internalError('Failed to handle invoice.paid webhook');
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
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError('Failed to handle invoice webhook');
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
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError('Failed to handle invoice webhook');
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
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    return result.internalError('Failed to handle invoice webhook');
  }
};

/**
 * Helper to narrow an object with a specific string property
 */
const hasStringProp = <T extends string>(obj: unknown, key: T): obj is Record<T, string> => !!obj && typeof obj === 'object' && key in obj && typeof (obj as Record<string, unknown>)[key] === 'string';

/**
 * Type guard for Stripe Invoice
 */
const isStripeInvoice = (obj: unknown): obj is Stripe.Invoice => {
  return hasStringProp(obj, 'object') && obj.object === 'invoice';
};

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
