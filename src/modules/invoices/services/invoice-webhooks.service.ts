import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import { billingTransactionsRepository } from '../database/queries/billing-transactions.repository';
import { invoicesRepository } from '../database/queries/invoices.repository';
import { db } from '@/shared/database';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'webhooks-service']);

/**
 * Invoice Webhooks Service
 *
 * Processes Stripe invoice-related webhook events.
 */
export const invoiceWebhooksService = {
  /**
   * Process a Stripe invoice event
   */
  async processEvent(event: Stripe.Event): Promise<Result<void>> {
    const eventType = event.type;
    const stripeInvoice = event.data.object as Stripe.Invoice;

    logger.info('Processing invoice webhook event {eventType} for Stripe Invoice {stripeInvoiceId}', {
      eventType,
      stripeInvoiceId: stripeInvoice.id,
    });

    switch (eventType) {
      case 'invoice.paid':
        return await this.handleInvoicePaid(stripeInvoice);
      case 'invoice.payment_failed':
        return await this.handleInvoicePaymentFailed(stripeInvoice);
      case 'invoice.voided':
        return await this.handleInvoiceVoided(stripeInvoice);
      case 'invoice.deleted':
        return await this.handleInvoiceDeleted(stripeInvoice);
      default:
        logger.info('Unhandled invoice event type: {eventType}', { eventType });
        return result.ok(undefined);
    }
  },

  /**
   * Handle invoice.paid event
   */
  async handleInvoicePaid(stripeInvoice: Stripe.Invoice): Promise<Result<void>> {
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

        // Create billing_transaction record for accounting
        await billingTransactionsRepository.createTransaction({
          invoice_id: invoice.id,
          matter_id: invoice.matter_id,
          amount: stripeInvoice.amount_paid,
          type: 'payout', // In Direct Charges, it's immediately paid out to them
          status: 'completed',
          destination_account_id: stripeInvoice.on_behalf_of as string || invoice.connected_account_id,
          completed_at: new Date(stripeInvoice.status_transitions.paid_at! * 1000),
          metadata: {
            stripe_invoice_id: stripeInvoice.id,
            // Note: charge is no longer a top-level property on Stripe.Invoice in v20
            // It's now accessed via invoice.payments sub-resource if needed
            stripe_charge_id: null,
          },
        }, tx);
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
  },

  /**
   * Handle invoice.payment_failed event
   */
  async handleInvoicePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<Result<void>> {
    try {
      const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
      if (!invoice) return result.ok(undefined);

      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'overdue',
        },
      );

      logger.info('❌ Payment failed for invoice {invoiceId}', { invoiceId: invoice.id });
      return result.ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return result.internalError(message);
    }
  },

  /**
   * Handle invoice.voided event
   */
  async handleInvoiceVoided(stripeInvoice: Stripe.Invoice): Promise<Result<void>> {
    try {
      const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
      if (!invoice) return result.ok(undefined);

      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'cancelled',
        },
      );

      logger.info('🚫 Invoice {invoiceId} voided', { invoiceId: invoice.id });
      return result.ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return result.internalError(message);
    }
  },

  /**
   * Handle invoice.deleted event (for draft invoices)
   */
  async handleInvoiceDeleted(stripeInvoice: Stripe.Invoice): Promise<Result<void>> {
    try {
      const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
      if (!invoice) return result.ok(undefined);

      // If it was deleted on Stripe, we should probably soft delete it locally too
      // if it hasn't been sent yet.
      await invoicesRepository.softDeleteInvoice(
        invoice.id,
        invoice.organization_id,
        'system', // Deleted by system/stripe
      );

      logger.info('🗑️ Invoice {invoiceId} deleted via Stripe', { invoiceId: invoice.id });
      return result.ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return result.internalError(message);
    }
  },
};
