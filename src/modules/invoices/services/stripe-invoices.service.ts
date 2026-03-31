import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import type { InvoiceWithRelations } from '../types/invoices.types';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';
import { stripe } from '@/shared/utils/stripe-client';

const logger = getLogger(['invoices', 'stripe-service']);

const wait = (delay: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delay));

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
  idempotencyKeyPrefix?: string
): Promise<Result<Stripe.Invoice>> => {
  if (!onBehalfOfAccountId) {
    return result.badRequest('Missing Stripe account ID for on_behalf_of');
  }

  const createdItemIds: string[] = [];

  try {
    // 1. Create the invoice first (empty shell)
    // Items must be explicitly attached via the `invoice` param because pending invoice items
    // Do NOT auto-attach to invoices that use `on_behalf_of` — Stripe isolates pending items
    // By account context and invoiceItems.create has no `on_behalf_of` parameter.
    const stripeInvoice = await stripe.invoices.create(
      {
        customer: stripeCustomerId,
        auto_advance: false,
        collection_method: 'send_invoice',
        on_behalf_of: onBehalfOfAccountId,
        pending_invoice_items_behavior: 'exclude',
        days_until_due: invoice.due_date
          ? Math.max(0, Math.ceil((invoice.due_date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
          : 30,
        metadata: {
          internal_invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
        description: invoice.notes ?? undefined,
        footer: invoice.memo ?? undefined,
      },
      idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:invoice` } : undefined
    );

    // 2. Create invoice items explicitly attached to the invoice
    if (invoice.lineItems) {
      const createdItems = await Promise.all(
        invoice.lineItems.map((item, index) => {
          const lineItemIdempotencySuffix = item.id ?? `${invoice.id}:${index}`;
          return stripe.invoiceItems.create(
            {
              customer: stripeCustomerId,
              invoice: stripeInvoice.id,
              amount: item.line_total,
              currency: 'usd',
              description: item.description,
              metadata: {
                internal_line_item_id: item.id,
                internal_invoice_id: invoice.id,
              },
            },
            idempotencyKeyPrefix
              ? { idempotencyKey: `${idempotencyKeyPrefix}:line-item:${lineItemIdempotencySuffix}` }
              : undefined
          );
        })
      );

      createdItemIds.push(...createdItems.map((item) => item.id));
    }

    return result.ok(stripeInvoice);
  } catch (error) {
    // 3. Cleanup on failure: delete created items and the invoice
    await Promise.all(
      createdItemIds.map(async (itemId) => {
        try {
          await stripe.invoiceItems.del(itemId);
        } catch (cleanupError) {
          logger.error('Failed to cleanup Stripe invoice item {itemId}: {error}', {
            itemId,
            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
          });
        }
      })
    );

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
  idempotencyKeyPrefix?: string
): Promise<Result<Stripe.Invoice>> => {
  const sendInvoiceWithRetry = async (attempt: number): Promise<Result<Stripe.Invoice>> => {
    try {
      const sent = await stripe.invoices.sendInvoice(
        stripeInvoiceId,
        {},
        idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:send` } : undefined
      );
      return result.ok(sent);
    } catch (error) {
      if (attempt >= 3) {
        logger.error('Failed to send Stripe invoice {stripeInvoiceId} after 3 attempts: {error}', {
          stripeInvoiceId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return result.internalError(`Invoice finalized but failed to send: ${errorMessage}`);
      }

      const delay = 2 ** attempt * 500; // Exponential backoff: 1s, 2s
      logger.warn('Failed to send Stripe invoice {stripeInvoiceId}, attempt {attempt}/3. Retrying in {delay}ms...', {
        stripeInvoiceId,
        attempt,
        delay,
      });
      await wait(delay);

      return sendInvoiceWithRetry(attempt + 1);
    }
  };

  try {
    // Finalize the invoice (converts draft to open)
    await stripe.invoices.finalizeInvoice(
      stripeInvoiceId,
      {},
      idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:finalize` } : undefined
    );

    // Send the invoice email with retries
    return sendInvoiceWithRetry(1);
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
const voidInvoice = async (stripeInvoiceId: string): Promise<Result<Stripe.Invoice>> => {
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
const deleteDraftInvoice = async (stripeInvoiceId: string): Promise<Result<Stripe.DeletedInvoice>> => {
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
const getStripeInvoice = async (stripeInvoiceId: string): Promise<Result<Stripe.Invoice>> => {
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
} as const;
