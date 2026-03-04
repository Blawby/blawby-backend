import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import type { InvoiceWithRelations } from '../types/invoices.types';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'stripe-service']);

/**
 * Stripe Invoices Service
 *
 * Handles interaction with Stripe API for invoices created on the platform account.
 * Uses separate charges + transfers model (no stripeAccount header).
 */

/**
 * Create a Stripe invoice for an internal invoice
 */
const createStripeInvoice = async (
  invoice: InvoiceWithRelations,
  stripeCustomerId: string,
  onBehalfOfAccountId: string,
): Promise<Result<Stripe.Invoice>> => {
  if (!onBehalfOfAccountId) {
    return result.badRequest('Missing Stripe account ID for on_behalf_of');
  }

  const createdItemIds: string[] = [];

  try {
    // 1. Create invoice items for each line item
    if (invoice.lineItems) {
      for (const item of invoice.lineItems) {
        const stripeItem = await stripe.invoiceItems.create({
          customer: stripeCustomerId,
          amount: item.line_total,
          currency: 'usd',
          description: item.description,
          metadata: {
            internal_line_item_id: item.id,
            internal_invoice_id: invoice.id,
          },
        });
        createdItemIds.push(stripeItem.id);
      }
    }

    // 2. Create the invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: stripeCustomerId,
      auto_advance: false,
      collection_method: 'send_invoice',
      on_behalf_of: onBehalfOfAccountId,
      days_until_due: invoice.due_date
        ? Math.max(0, Math.ceil((invoice.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : 30,
      metadata: {
        internal_invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
      description: invoice.notes || undefined,
      footer: invoice.memo || undefined,
    });

    return result.ok(stripeInvoice);
  } catch (error) {
    // 3. Cleanup on failure: delete created items
    for (const itemId of createdItemIds) {
      try {
        await stripe.invoiceItems.del(itemId);
      } catch (cleanupError) {
        logger.error('Failed to cleanup Stripe invoice item {itemId}: {error}', {
          itemId,
          error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
        });
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to create Stripe invoice {invoiceId}: {error}', {
      invoiceId: invoice.id,
      error: message,
    });
    return result.internalError('Failed to create Stripe invoice');
  }
};

/**
 * Finalize and send a Stripe invoice with retry logic
 */
const finalizeAndSendInvoice = async (
  stripeInvoiceId: string,
): Promise<Result<Stripe.Invoice>> => {
  try {
    // Finalize the invoice (converts draft to open)
    await stripe.invoices.finalizeInvoice(stripeInvoiceId);

    // Send the invoice email with retries
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const sent = await stripe.invoices.sendInvoice(stripeInvoiceId);
        return result.ok(sent);
      } catch (error) {
        lastError = error;
        const delay = Math.pow(2, attempt) * 500; // exponential backoff: 1s, 2s, 4s
        logger.warn('Failed to send Stripe invoice {stripeInvoiceId}, attempt {attempt}/3. Retrying in {delay}ms...', {
          stripeInvoiceId,
          attempt,
          delay,
        });
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    logger.error('Failed to send Stripe invoice {stripeInvoiceId} after 3 attempts: {error}', {
      stripeInvoiceId,
      error: lastError instanceof Error ? lastError.message : 'Unknown error',
    });

    const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error';
    return result.internalError(`Invoice finalized but failed to send: ${errorMessage}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to finalize/send Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    return result.internalError('Failed to finalize or send Stripe invoice');
  }
};

/**
 * Void a Stripe invoice
 */
const voidInvoice = async (
  stripeInvoiceId: string,
): Promise<Result<Stripe.Invoice>> => {
  try {
    const voided = await stripe.invoices.voidInvoice(stripeInvoiceId);
    return result.ok(voided);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to void Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    return result.internalError('Failed to void Stripe invoice');
  }
};

/**
 * Delete a draft Stripe invoice
 */
const deleteDraftInvoice = async (
  stripeInvoiceId: string,
): Promise<Result<Stripe.DeletedInvoice>> => {
  try {
    const deleted = await stripe.invoices.del(stripeInvoiceId);
    return result.ok(deleted);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete draft Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    return result.internalError('Failed to delete draft Stripe invoice');
  }
};

/**
 * Retrieve a Stripe invoice
 */
const getStripeInvoice = async (
  stripeInvoiceId: string,
): Promise<Result<Stripe.Invoice>> => {
  try {
    const stripeInvoice = await stripe.invoices.retrieve(stripeInvoiceId);
    return result.ok(stripeInvoice);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to retrieve Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    return result.internalError('Failed to retrieve Stripe invoice');
  }
};

export const stripeInvoicesService = {
  createStripeInvoice,
  finalizeAndSendInvoice,
  voidInvoice,
  deleteDraftInvoice,
  getStripeInvoice,
};
