import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { mattersQueries } from '@/modules/matters/database/queries/matters.queries';
import { db } from '@/shared/database';
import {
  InvoicePaid,
  InvoicePaymentFailed,
  InvoiceVoided,
  InvoiceDeleted,
} from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'webhooks-service']);

/**
 * Extended Stripe Invoice to handle missing properties in formal types
 */
interface ExtendedStripeInvoice extends Stripe.Invoice {
  charge?: string | null;
}

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

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'paid',
          amount_paid: stripeInvoice.amount_paid,
          amount_due: stripeInvoice.amount_remaining,
          paid_at: new Date(stripeInvoice.status_transitions.paid_at! * 1000),
        },
        tx,
      );

      const extendedInvoice = stripeInvoice as ExtendedStripeInvoice;

      // Safe access to destination_account_id
      let destinationAccountId = invoice.connected_account_id;
      if (extendedInvoice.on_behalf_of) {
        destinationAccountId = typeof extendedInvoice.on_behalf_of === 'string'
          ? extendedInvoice.on_behalf_of
          : extendedInvoice.on_behalf_of.id;
      }

      // Create billing_transaction record for accounting
      await billingTransactionsRepository.createTransaction({
        invoice_id: invoice.id,
        matter_id: invoice.matter_id,
        amount: stripeInvoice.amount_paid,
        type: 'payout', // In Direct Charges, it's immediately paid out to them
        status: 'completed',
        destination_account_id: destinationAccountId,
        completed_at: new Date(stripeInvoice.status_transitions.paid_at! * 1000),
        metadata: {
          stripe_invoice_id: stripeInvoice.id,
          stripe_charge_id: (extendedInvoice.charge || null) as unknown,
        } as Record<string, unknown>,
      }, tx);

      // Deduct from retainer balance if applicable
      if (invoice.matter_id && invoice.payment_from_retainer) {
        const matter = await mattersQueries.findMatterById(invoice.matter_id);
        if (matter) {
          const newBalance = Math.max(0, matter.retainer_balance - stripeInvoice.amount_paid);
          await mattersQueries.updateRetainerBalance(invoice.matter_id, newBalance, tx);

          logger.info('Updated retainer balance for matter {matterId}: {oldBalance} -> {newBalance}', {
            matterId: invoice.matter_id,
            oldBalance: matter.retainer_balance,
            newBalance,
          });
        }
      }

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
    });

    logger.info('✅ Invoice {invoiceId} marked as paid', { invoiceId: invoice.id });
    return result.ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice.paid {stripeInvoiceId}: {error}', {
      stripeInvoiceId: stripeInvoice.id,
      error: message,
    });
    return result.internalError(message);
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
    return result.internalError(message);
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
    return result.internalError(message);
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
        'system',
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
    return result.internalError(message);
  }
};

/**
 * Process a Stripe invoice event
 */
const processEvent = async (event: Stripe.Event): Promise<Result<void>> => {
  const eventType = event.type;
  const stripeInvoice = event.data.object as Stripe.Invoice;

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

