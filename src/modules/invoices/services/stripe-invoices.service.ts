import { getLogger } from '@logtape/logtape';
import type Stripe from 'stripe';
import type { InvoiceWithRelations } from '../types/invoices.types';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'stripe-service']);

/**
 * Stripe Invoices Service
 *
 * Handles interaction with Stripe API for invoices on connected accounts.
 * Uses Direct Charges (stripeAccount header).
 */
export const stripeInvoicesService = {
  /**
   * Create a Stripe invoice for an internal invoice
   */
  async createStripeInvoice(
    invoice: InvoiceWithRelations,
    stripeCustomerId: string,
  ): Promise<Result<Stripe.Invoice>> {
    const stripeAccountId = invoice.connected_account_id;

    try {
      // 1. Create invoice items for each line item
      if (invoice.lineItems) {
        for (const item of invoice.lineItems) {
          await stripe.invoiceItems.create({
            customer: stripeCustomerId,
            amount: item.line_total,
            currency: 'usd',
            description: item.description,
            metadata: {
              internal_line_item_id: item.id,
              internal_invoice_id: invoice.id,
            },
          }, {
            stripeAccount: stripeAccountId,
          });
        }
      }

      // 2. Create the invoice
      const stripeInvoice = await stripe.invoices.create({
        customer: stripeCustomerId,
        auto_advance: false,
        collection_method: 'send_invoice',
        days_until_due: invoice.due_date
          ? Math.max(0, Math.ceil((invoice.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 30,
        metadata: {
          internal_invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
        description: invoice.notes || undefined,
        footer: invoice.memo || undefined,
      }, {
        stripeAccount: stripeAccountId,
      });

      return result.ok(stripeInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create Stripe invoice {invoiceId}: {error}', {
        invoiceId: invoice.id,
        error: message,
      });
      return result.internalError(message);
    }
  },

  /**
   * Finalize and send a Stripe invoice
   */
  async finalizeAndSendInvoice(
    stripeInvoiceId: string,
    stripeAccountId: string,
  ): Promise<Result<Stripe.Invoice>> {
    try {
      // Finalize the invoice (converts draft to open)
      await stripe.invoices.finalizeInvoice(stripeInvoiceId, {}, {
        stripeAccount: stripeAccountId,
      });

      // Send the invoice email
      const sent = await stripe.invoices.sendInvoice(stripeInvoiceId, {}, {
        stripeAccount: stripeAccountId,
      });

      return result.ok(sent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to finalize/send Stripe invoice {stripeInvoiceId}: {error}', {
        stripeInvoiceId,
        error: message,
      });
      return result.internalError(message);
    }
  },

  /**
   * Void a Stripe invoice
   */
  async voidInvoice(
    stripeInvoiceId: string,
    stripeAccountId: string,
  ): Promise<Result<Stripe.Invoice>> {
    try {
      const voided = await stripe.invoices.voidInvoice(stripeInvoiceId, {}, {
        stripeAccount: stripeAccountId,
      });
      return result.ok(voided);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to void Stripe invoice {stripeInvoiceId}: {error}', {
        stripeInvoiceId,
        error: message,
      });
      return result.internalError(message);
    }
  },

  /**
   * Delete a draft Stripe invoice
   */
  async deleteDraftInvoice(
    stripeInvoiceId: string,
    stripeAccountId: string,
  ): Promise<Result<Stripe.DeletedInvoice>> {
    try {
      const deleted = await stripe.invoices.del(stripeInvoiceId, {}, {
        stripeAccount: stripeAccountId,
      });
      return result.ok(deleted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to delete draft Stripe invoice {stripeInvoiceId}: {error}', {
        stripeInvoiceId,
        error: message,
      });
      return result.internalError(message);
    }
  },

  /**
   * Retrieve a Stripe invoice
   */
  async getStripeInvoice(
    stripeInvoiceId: string,
    stripeAccountId: string,
  ): Promise<Result<Stripe.Invoice>> {
    try {
      const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId, {}, {
        stripeAccount: stripeAccountId,
      });
      return result.ok(stripeInvoice);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to retrieve Stripe invoice {stripeInvoiceId}: {error}', {
        stripeInvoiceId,
        error: message,
      });
      return result.internalError(message);
    }
  },
};
