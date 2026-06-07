import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import {
  dispatchVoidSystemError,
  enqueueVoidReconciliation,
} from '@/modules/invoices/services/invoice.delivery.recovery';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { db } from '@/shared/database';
import { InvoiceVoided } from '@/shared/events/definitions';
import type { ServiceContext } from '@/shared/types/service-context';
import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';

const logger = getLogger(['invoices', 'voiding-service']);

export type VoidInvoiceResult = InvoiceWithRelations & { reconciliation_pending?: boolean };

export const attemptStripeVoidWithRecovery = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
  stripeAccountId,
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

export const voidInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<VoidInvoiceResult> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  let stripeVoidSucceeded = false;
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
      const transitioned = await invoicesRepository.transitionInvoiceStatus(
        id,
        ctx.organizationId,
        'sent',
        'cancelled'
      );
      if (!transitioned) {
        throw new HTTPException(409, { message: 'Invoice status changed before void could be applied' });
      }
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
    stripeVoidSucceeded = true;

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!updated) {
      throw new HTTPException(404, { message: 'Invoice not found after void' });
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    let cancelledInvoice: InvoiceWithRelations | undefined = undefined;
    try {
      cancelledInvoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    } catch (refetchError) {
      logger.error('Failed to refetch invoice during void error handling: {error}', {
        invoiceId: id,
        error: refetchError instanceof Error ? refetchError.message : 'Unknown error',
      });
    }

    if (cancelledInvoice?.status === 'cancelled' && !stripeVoidSucceeded) {
      logger.warn('Invoice cancelled locally; Stripe reconciliation pending for {invoiceId}: {error}', {
        invoiceId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { ...cancelledInvoice, reconciliation_pending: true };
    }

    logger.error('Failed to void invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to void invoice', { cause: error });
  }
};
