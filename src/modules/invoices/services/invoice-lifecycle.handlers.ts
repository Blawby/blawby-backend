/**
 * Invoice Lifecycle Handlers
 *
 * Handles simple invoice state transitions: payment_failed, voided, deleted.
 * These are straightforward status updates with minimal business logic.
 */

import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { InvoicePaymentFailed, InvoiceVoided, InvoiceDeleted } from '@/shared/events/definitions';
import { db } from '@/shared/database';

const logger = getLogger(['invoices', 'lifecycle-handlers']);

/**
 * Handle invoice.payment_failed event
 */
export const handleInvoicePaymentFailed = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return;
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'overdue',
        },
        tx
      );

      await InvoicePaymentFailed.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          stripe_invoice_id: stripeInvoice.id,
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('❌ Payment failed for invoice {invoiceId}', { invoiceId: invoice.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    throw new Error('Failed to handle invoice webhook', { cause: error });
  }
};

/**
 * Handle invoice.voided event
 */
export const handleInvoiceVoided = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return;
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(
        invoice.id,
        invoice.organization_id,
        {
          status: 'cancelled',
        },
        tx
      );

      await InvoiceVoided.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          stripe_invoice_id: stripeInvoice.id,
          voided_by: 'webhook',
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('🚫 Invoice {invoiceId} voided', { invoiceId: invoice.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    throw new Error('Failed to handle invoice webhook', { cause: error });
  }
};

/**
 * Handle invoice.deleted event (for draft invoices)
 */
export const handleInvoiceDeleted = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  try {
    const invoice = await invoicesRepository.findInvoiceByStripeId(stripeInvoice.id);
    if (!invoice) {
      return;
    }

    await db.transaction(async (tx) => {
      await invoicesRepository.softDeleteInvoice(invoice.id, invoice.organization_id, null, tx);

      await InvoiceDeleted.dispatch(
        {
          invoice_id: invoice.id,
          organization_id: invoice.organization_id,
          deleted_by: 'webhook',
        },
        {
          actorId: 'webhook',
          actorType: 'webhook',
          organizationId: invoice.organization_id,
          tx,
        }
      );
    });

    logger.info('🗑️ Invoice {invoiceId} deleted via Stripe', { invoiceId: invoice.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to handle invoice webhook: {error}', { error: message });
    throw new Error('Failed to handle invoice webhook', { cause: error });
  }
};
