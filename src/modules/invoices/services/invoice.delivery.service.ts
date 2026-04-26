import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import {
  createAndSendStripeInvoice,
  dispatchVoidSystemError,
  enqueueVoidReconciliation,
  lockInvoiceForSending,
  markInvoiceSent,
  syncStripeState,
} from '@/modules/invoices/services/invoice.delivery.helpers';
import { handleInvoiceCreated, handleInvoiceUpcoming } from '@/modules/invoices/services/invoice.webhook.delivery';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceVoided } from '@/shared/events/definitions';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'delivery-service']);

const sendInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    let invoice = await lockInvoiceForSending({ id }, ctx);

    const idempotencyKeyPrefix = `invoice-send:${id}`;
    let stripeInvoiceId: string | null = null;
    try {
      if (!invoice.client?.stripe_customer_id) {
        const setupResult = await clientsCrudService.ensureClientSetup({ id: invoice.client_id }, ctx);
        if (!setupResult.stripe_customer_id) {
          throw new Error('Failed to setup Stripe customer for client');
        }

        const freshInvoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
        if (!freshInvoice) {
          throw new HTTPException(404, { message: 'Invoice not found after client setup' });
        }
        invoice = freshInvoice;
      }

      const stripeInvoice = await createAndSendStripeInvoice({ invWithRel: invoice, idempotencyKeyPrefix });
      stripeInvoiceId = stripeInvoice.id;
      const persistedStripeInvoice = await invoicesRepository.persistStripeInvoiceId(
        id,
        ctx.organizationId,
        stripeInvoice.id
      );
      if (!persistedStripeInvoice) {
        throw new Error(`Failed to persist Stripe invoice ID for invoice ${id}`);
      }
      const updatedInvoice = await markInvoiceSent({ invoiceId: id, invoice, stripeInvoice }, ctx);

      return updatedInvoice;
    } catch (error) {
      try {
        await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'sending', 'draft');
      } catch (rollbackError) {
        logger.error('Failed to rollback invoice from sending to draft: {error}', {
          invoiceId: id,
          organizationId: ctx.organizationId,
          stripeInvoiceId,
          error: rollbackError instanceof Error ? rollbackError.message : 'Unknown error',
        });
      }
      logger.error('Failed during invoice send after sending transition: {error}', {
        invoiceId: id,
        organizationId: ctx.organizationId,
        stripeInvoiceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to finalize and send invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to finalize and send invoice');
  }
};

const syncInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    const invoice = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!invoice) {
      throw new HTTPException(404, { message: 'Invoice not found' });
    }
    if (!invoice.stripe_invoice_id) {
      throw new HTTPException(400, { message: 'Invoice has not been synced with Stripe' });
    }

    const stripeInvoice = await stripeApiAdapter.getStripeInvoice(invoice.stripe_invoice_id);
    const updated = await syncStripeState({ invoiceId: id, stripeInvoice, currentInvoice: invoice }, ctx);

    if (!updated) {
      throw new HTTPException(404, { message: 'Invoice not found after sync' });
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to sync invoice with Stripe: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to sync invoice with Stripe');
  }
};

const voidInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
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

    try {
      await stripeApiAdapter.voidInvoice(stripeInvoiceId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Invoice marked cancelled but Stripe void failed for invoice {invoiceId}: {error}', {
        invoiceId: id,
        stripeInvoiceId,
        error: message,
      });

      await enqueueVoidReconciliation({
        invoiceId: id,
        organizationId: ctx.organizationId,
        stripeInvoiceId,
      });
      try {
        await dispatchVoidSystemError({
          invoiceId: id,
          organizationId: ctx.organizationId,
          stripeInvoiceId,
          ctx,
        });
      } catch (dispatchError) {
        logger.error('Failed to dispatch invoice void system error: {error}', {
          invoiceId: id,
          organizationId: ctx.organizationId,
          stripeInvoiceId,
          error: dispatchError instanceof Error ? dispatchError.message : 'Unknown error',
        });
      }

      throw error;
    }

    const updated = await invoicesRepository.findInvoiceById(id, ctx.organizationId);
    if (!updated) {
      throw new HTTPException(404, { message: 'Invoice not found after void' });
    }

    return updated;
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }
    logger.error('Failed to void invoice: {error}', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: id,
    });
    throw new Error('Failed to void invoice');
  }
};

export const invoiceDeliveryService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
  handleInvoiceUpcoming,
  handleInvoiceCreated,
} as const;
