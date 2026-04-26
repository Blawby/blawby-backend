import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import {
  dispatchVoidSystemError,
  enqueueVoidReconciliation,
} from '@/modules/invoices/services/invoice.delivery.recovery';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceVoided } from '@/shared/events/definitions';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'voiding-service']);

export const attemptStripeVoidWithRecovery = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
  stripeAccountId,
  ctx,
}: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
  stripeAccountId: string;
  ctx: ServiceContext;
}): Promise<void> => {
  try {
    await stripeApiAdapter.voidInvoice(stripeInvoiceId, stripeAccountId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Invoice marked cancelled but Stripe void failed for invoice {invoiceId}: {error}', {
      invoiceId,
      stripeInvoiceId,
      error: message,
    });

    await enqueueVoidReconciliation({
      invoiceId,
      organizationId,
      stripeInvoiceId,
    });
    try {
      await dispatchVoidSystemError({
        invoiceId,
        organizationId,
        stripeInvoiceId,
        ctx,
      });
    } catch (dispatchError) {
      logger.error('Failed to dispatch invoice void system error: {error}', {
        invoiceId,
        organizationId,
        stripeInvoiceId,
        error: dispatchError instanceof Error ? dispatchError.message : 'Unknown error',
      });
    }

    throw error;
  }
};

export const voidInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }

    if (invoice.status !== 'sent') {
      throw new HTTPException(400, { message: 'Only sent invoices can be voided' });
    }

    if (!invoice.stripe_invoice_id) {
      throw new HTTPException(400, { message: 'Invoice has no Stripe record' });
    }
    if (!invoice.connectedAccount?.stripe_account_id) {
      throw new HTTPException(400, { message: 'Invoice is missing a Stripe connected account' });
    }
    const stripeInvoiceId = invoice.stripe_invoice_id;

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(id, ctx.organizationId, { status: 'cancelled' }, tx);
      await InvoiceVoided.dispatch(
        {
          invoice_id: id,
          organization_id: ctx.organizationId,
          stripe_invoice_id: stripeInvoiceId,
          voided_by: 'user',
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
          tx,
        }
      );
    });

    await attemptStripeVoidWithRecovery({
      invoiceId: id,
      organizationId: ctx.organizationId,
      stripeInvoiceId,
      stripeAccountId: invoice.connectedAccount.stripe_account_id,
      ctx,
    });

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!updated) {
      throw new HTTPException(404, { message: 'Invoice not found after void' });
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    const cancelledInvoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (cancelledInvoice?.status === 'cancelled') {
      logger.error('Invoice cancelled locally; Stripe reconciliation pending for {invoiceId}: {error}', {
        invoiceId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new HTTPException(202, { message: 'Invoice cancelled locally; Stripe reconciliation pending' });
    }
    logger.error('Failed to void invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to void invoice', { cause: error });
  }
};
