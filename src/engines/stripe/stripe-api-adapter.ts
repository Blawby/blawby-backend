import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { HTTPException } from 'hono/http-exception';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { stripe } from '@/shared/utils/stripe-client';
import { wrapStripeError } from '@/shared/utils/stripe-error';

const logger = getLogger(['engines', 'stripe', 'stripe-api-adapter']);

const wait = (delay: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delay));

/**
 * Create a Stripe invoice shell with line items attached.
 * Uses separate charges + transfers model (no stripeAccount header).
 * Cleans up on failure.
 */
const createStripeInvoice = async (
  invoice: InvoiceWithRelations,
  stripeCustomerId: string,
  onBehalfOfAccountId: string,
  idempotencyKeyPrefix?: string
): Promise<Stripe.Invoice> => {
  if (!onBehalfOfAccountId) {
    throw new HTTPException(400, { message: 'Missing Stripe account ID for on_behalf_of' });
  }

  const createdItemIds: string[] = [];

  try {
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

    if (invoice.line_items) {
      const createdItems = await Promise.all(
        invoice.line_items.map((item, index) => {
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

    return stripeInvoice;
  } catch (error) {
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
    logger.error('Failed to create Stripe invoice {invoiceId}: {error}', { invoiceId: invoice.id, error: message });
    throw new Error(`Failed to create Stripe invoice: ${message}`);
  }
};

/**
 * Finalize a draft Stripe invoice and send it to the customer.
 * Retries send up to 3 times with exponential backoff.
 */
const finalizeAndSendInvoice = async (
  stripeInvoiceId: string,
  idempotencyKeyPrefix?: string
): Promise<Stripe.Invoice> => {
  const sendWithRetry = async (attempt: number): Promise<Stripe.Invoice> => {
    try {
      return await stripe.invoices.sendInvoice(
        stripeInvoiceId,
        {},
        idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:send` } : undefined
      );
    } catch (error) {
      if (attempt >= 3) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Failed to send Stripe invoice {stripeInvoiceId} after 3 attempts: {error}', {
          stripeInvoiceId,
          error: message,
        });
        throw new Error(`Invoice finalized but failed to send: ${message}`);
      }
      const delay = 2 ** attempt * 500;
      logger.warn('Failed to send Stripe invoice {stripeInvoiceId}, attempt {attempt}/3. Retrying in {delay}ms...', {
        stripeInvoiceId,
        attempt,
        delay,
      });
      await wait(delay);
      return sendWithRetry(attempt + 1);
    }
  };

  try {
    await stripe.invoices.finalizeInvoice(
      stripeInvoiceId,
      {},
      idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:finalize` } : undefined
    );
    return sendWithRetry(1);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to finalize/send Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    throw new Error(`Failed to finalize or send Stripe invoice: ${message}`);
  }
};

/**
 * Void an open Stripe invoice.
 */
const voidInvoice = async (stripeInvoiceId: string): Promise<Stripe.Invoice> => {
  try {
    return await stripe.invoices.voidInvoice(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to void Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw new Error(`Failed to void Stripe invoice: ${message}`);
  }
};

/**
 * Delete a draft Stripe invoice.
 */
const deleteDraftInvoice = async (stripeInvoiceId: string): Promise<Stripe.DeletedInvoice> => {
  try {
    return await stripe.invoices.del(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete draft Stripe invoice {stripeInvoiceId}: {error}', {
      stripeInvoiceId,
      error: message,
    });
    throw new Error(`Failed to delete draft Stripe invoice: ${message}`);
  }
};

/**
 * Retrieve a Stripe invoice by ID.
 */
const getStripeInvoice = async (stripeInvoiceId: string): Promise<Stripe.Invoice> => {
  try {
    return await stripe.invoices.retrieve(stripeInvoiceId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to retrieve Stripe invoice {stripeInvoiceId}: {error}', { stripeInvoiceId, error: message });
    throw new Error(`Failed to retrieve Stripe invoice: ${message}`);
  }
};

export const stripeApiAdapter = {
  createStripeInvoice,
  finalizeAndSendInvoice,
  voidInvoice,
  deleteDraftInvoice,
  getStripeInvoice,
};
