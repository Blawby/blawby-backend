import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import {
  createAndSendStripeInvoice,
  lockInvoiceForSending,
  markInvoiceSent,
} from '@/modules/invoices/services/invoice.delivery.lock';
import { syncStripeState } from '@/modules/invoices/services/invoice.delivery.recovery';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { voidInvoice } from '@/modules/invoices/services/invoice.voiding.service';
import { db } from '@/shared/database';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'delivery-service']);

const sendAndPersistStripeInvoice = async ({
  invoice,
  id,
  idempotencyKeyPrefix,
  ctx,
}: {
  invoice: InvoiceWithRelations;
  id: string;
  idempotencyKeyPrefix: string;
  ctx: ServiceContext;
}): Promise<{ updatedInvoice: InvoiceWithRelations; stripeInvoiceId: string }> => {
  if (!invoice.connectedAccount?.stripe_account_id) {
    throw new HTTPException(400, { message: 'Invoice is missing a Stripe connected account' });
  }

  const stripeInvoice = await createAndSendStripeInvoice({
    invWithRel: invoice,
    idempotencyKeyPrefix,
    stripeAccountId: invoice.connectedAccount.stripe_account_id,
  });
  const stripeInvoiceId = stripeInvoice.id;
  const persistedStripeInvoice = await invoicesRepository.persistStripeInvoiceId(id, ctx.organizationId, stripeInvoice.id);
  if (persistedStripeInvoice.status === 'missing') {
    throw new Error(`Failed to persist Stripe invoice ID for invoice ${id}`);
  }
  if (
    persistedStripeInvoice.status === 'already-linked' &&
    persistedStripeInvoice.invoice.stripe_invoice_id !== stripeInvoice.id
  ) {
    throw new Error(`Invoice ${id} is already linked to a different Stripe invoice`);
  }

  return {
    updatedInvoice: await markInvoiceSent({ invoiceId: id, invoice, stripeInvoice }, ctx),
    stripeInvoiceId,
  };
};

const rollbackSendingTransaction = async ({
  id,
  organizationId,
  stripeInvoiceId,
  stripeAccountId,
}: {
  id: string;
  organizationId: string;
  stripeInvoiceId: string | null;
  stripeAccountId: string | null;
}): Promise<void> => {
  await db.transaction(async (tx) => {
    const rolledBack = await invoicesRepository.transitionInvoiceStatus(id, organizationId, 'sending', 'draft', tx);
    if (!rolledBack) {
      throw new Error('Invoice was not in sending state during rollback');
    }
    if (stripeInvoiceId) {
      await invoicesRepository.updateInvoice(id, organizationId, { stripe_invoice_id: null }, tx);
    }
  });

  if (stripeInvoiceId && stripeAccountId) {
    try {
      await stripeApiAdapter.voidInvoice(stripeInvoiceId, stripeAccountId);
    } catch (stripeRollbackError) {
      logger.error('Failed to void Stripe invoice during send rollback: {error}', {
        invoiceId: id,
        organizationId,
        stripeInvoiceId,
        error: stripeRollbackError instanceof Error ? stripeRollbackError.message : 'Unknown error',
      });
    }
  }
};

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
      const result = await sendAndPersistStripeInvoice({ invoice, id, idempotencyKeyPrefix, ctx });
      stripeInvoiceId = result.stripeInvoiceId;

      return result.updatedInvoice;
    } catch (error) {
      try {
        await rollbackSendingTransaction({
          id,
          organizationId: ctx.organizationId,
          stripeInvoiceId,
          stripeAccountId: invoice.connectedAccount?.stripe_account_id ?? null,
        });
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
    throw new Error('Failed to finalize and send invoice', { cause: error });
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
    if (!invoice.connectedAccount?.stripe_account_id) {
      throw new HTTPException(400, { message: 'Invoice is missing a Stripe connected account' });
    }

    const stripeInvoice = await stripeApiAdapter.getStripeInvoice(
      invoice.stripe_invoice_id,
      invoice.connectedAccount.stripe_account_id
    );
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
    throw new Error('Failed to sync invoice with Stripe', { cause: error });
  }
};

export const invoiceDeliveryService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
} as const;
