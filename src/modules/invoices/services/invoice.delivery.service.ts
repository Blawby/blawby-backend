import { ForbiddenError } from '@casl/ability';
import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { eq } from 'drizzle-orm';
import type { Stripe } from 'stripe';
import { seatMeteringService } from '@/modules/subscriptions/services/seat-metering.service';
import { clientsCrudService } from '@/modules/clients/services/clients-crud.service';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { organizations } from '@/schema/better-auth-schema';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { InvoiceSent, InvoiceVoided, SystemErrorOccurred } from '@/shared/events/definitions';
import { db } from '@/shared/database';
import { addInvoiceVoidReconciliationJob } from '@/shared/queue/queue.manager';
import type { ServiceContext } from '@/shared/types/service-context';

const logger = getLogger(['invoices', 'delivery-service']);

const createAndSendStripeInvoice = async (
  {
    invWithRel,
    idempotencyKeyPrefix,
  }: {
    invWithRel: InvoiceWithRelations;
    idempotencyKeyPrefix?: string;
  }
): Promise<Stripe.Invoice> => {
  if (!invWithRel.client?.stripe_customer_id) {
    throw new Error('Client is missing Stripe customer ID');
  }

  const stripeInvoice = await stripeApiAdapter.createStripeInvoice(
    invWithRel,
    invWithRel.client.stripe_customer_id,
    invWithRel.connectedAccount.stripe_account_id,
    idempotencyKeyPrefix
  );

  return await stripeApiAdapter.finalizeAndSendInvoice(stripeInvoice.id, idempotencyKeyPrefix);
};

const markInvoiceSent = async (
  {
    invoiceId,
    invoice,
    stripeInvoice,
  }: {
    invoiceId: string;
    invoice: InvoiceWithRelations;
    stripeInvoice: Stripe.Invoice;
  },
  ctx: ServiceContext
): Promise<InvoiceWithRelations> => {
  return await db.transaction(async (tx) => {
    const transitioned = await invoicesRepository.transitionInvoiceStatus(
      invoiceId,
      ctx.organizationId,
      'sending',
      'sent',
      tx
    );
    if (!transitioned) {
      throw new HTTPException(409, { message: 'Invoice status changed while sending' });
    }

    await invoicesRepository.updateInvoice(
      invoiceId,
      ctx.organizationId,
      {
        stripe_invoice_id: stripeInvoice.id,
        stripe_hosted_invoice_url: stripeInvoice.hosted_invoice_url,
        issue_date: new Date(),
      },
      tx
    );

    await InvoiceSent.dispatch(
      {
        invoice_id: invoiceId,
        organization_id: ctx.organizationId,
        client_id: invoice.client_id,
        stripe_invoice_id: stripeInvoice.id,
        stripe_hosted_invoice_url: stripeInvoice.hosted_invoice_url!,
        total: invoice.total,
      },
      {
        actorId: ctx.userId,
        actorType: 'user',
        organizationId: ctx.organizationId,
        tx,
      }
    );

    const updated = await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId, tx);
    if (!updated) {
      throw new Error('Invoice not found after update');
    }

    return updated;
  });
};

const syncStripeState = async (
  {
    invoiceId,
    stripeInvoice,
    currentInvoice,
  }: {
    invoiceId: string;
    stripeInvoice: Stripe.Invoice;
    currentInvoice: InvoiceWithRelations;
  },
  ctx: ServiceContext
): Promise<InvoiceWithRelations | undefined> => {
  const statusMap: Record<string, string> = {
    draft: 'draft',
    open: 'sent',
    paid: 'paid',
    uncollectible: 'overdue',
    void: 'cancelled',
  };

  await invoicesRepository.updateInvoice(invoiceId, ctx.organizationId, {
    status: statusMap[stripeInvoice.status ?? ''] || currentInvoice.status,
    amount_paid: stripeInvoice.amount_paid,
    amount_due: stripeInvoice.amount_remaining,
    paid_at: stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : undefined,
  });

  return await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId);
};

const syncSeatCountForInvoice = async (stripeInvoice: Stripe.Invoice, eventType: 'invoice.upcoming' | 'invoice.created') => {
  const customerId = typeof stripeInvoice.customer === 'string' ? stripeInvoice.customer : stripeInvoice.customer?.id;

  if (!customerId) {
    logger.warn('{eventType} event missing customer ID: {invoiceId}', {
      eventType,
      invoiceId: stripeInvoice.id,
    });
    return;
  }

  const [org] = await db
    .select({
      id: organizations.id,
      stripeCustomerId: organizations.stripeCustomerId,
    })
    .from(organizations)
    .where(eq(organizations.stripeCustomerId, customerId))
    .limit(1);

  if (!org) {
    logger.warn('Organization not found for Stripe Customer ID: {customerId} (invoice: {invoiceId})', {
      customerId,
      invoiceId: stripeInvoice.id,
    });
    return;
  }

  const meteringSynced = await seatMeteringService.syncSeatCountOnInvoice(db, stripeInvoice, org.id, customerId);

  logger.info(
    meteringSynced
      ? 'Processed {eventType} event: {invoiceId} for organization {organizationId}'
      : 'Processed {eventType} event: {invoiceId} for organization {organizationId} (metering sync failed)',
    {
      eventType,
      invoiceId: stripeInvoice.id,
      organizationId: org.id,
    }
  );
};

const sendInvoice = async ({ id }: { id: string }, ctx: ServiceContext): Promise<InvoiceWithRelations> => {
  ForbiddenError.from(ctx.ability).throwUnlessCan('update', 'Invoice');

  try {
    let invoice = await db.transaction(async (tx) => {
      const found = await invoicesRepository.findInvoiceById(id, ctx.organizationId, tx);
      if (!found) {
        throw new HTTPException(404, { message: 'Invoice not found' });
      }

      if (found.status !== 'draft') {
        throw new HTTPException(400, { message: 'Only draft invoices can be sent' });
      }

      if (!found.lineItems.length) {
        throw new HTTPException(400, { message: 'Cannot send an invoice with no line items' });
      }

      if (found.total <= 0) {
        throw new HTTPException(400, { message: 'Cannot send an invoice with zero or negative total' });
      }

      const lockedInvoice = await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'draft', 'sending', tx);
      if (!lockedInvoice) {
        throw new HTTPException(409, { message: 'Invoice is already being sent by another request' });
      }

      return found;
    });

    const idempotencyKeyPrefix = `invoice-send:${id}`;
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
      const updatedInvoice = await markInvoiceSent({ invoiceId: id, invoice, stripeInvoice }, ctx);

      return updatedInvoice;
    } catch (error) {
      await invoicesRepository.transitionInvoiceStatus(id, ctx.organizationId, 'sending', 'draft');
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

    await db.transaction(async (tx) => {
      await invoicesRepository.updateInvoice(id, ctx.organizationId, { status: 'cancelled' }, tx);
      await InvoiceVoided.dispatch(
        {
          invoice_id: id,
          organization_id: ctx.organizationId,
          stripe_invoice_id: invoice.stripe_invoice_id!,
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
      await stripeApiAdapter.voidInvoice(invoice.stripe_invoice_id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Invoice marked cancelled but Stripe void failed for invoice {invoiceId}: {error}', {
        invoiceId: id,
        stripeInvoiceId: invoice.stripe_invoice_id,
        error: message,
      });

      await addInvoiceVoidReconciliationJob({
        invoiceId: id,
        organizationId: ctx.organizationId,
        stripeInvoiceId: invoice.stripe_invoice_id,
      });

      await SystemErrorOccurred.dispatch(
        {
          error: 'Invoice marked cancelled but Stripe void failed',
          context: {
            invoiceId: id,
            organizationId: ctx.organizationId,
            stripeInvoiceId: invoice.stripe_invoice_id,
            recovery: 'Re-run invoice void reconciliation against Stripe',
          },
        },
        {
          actorId: ctx.userId,
          actorType: 'user',
          organizationId: ctx.organizationId,
        }
      );

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

const handleInvoiceUpcoming = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  await syncSeatCountForInvoice(stripeInvoice, 'invoice.upcoming');
};

const handleInvoiceCreated = async (stripeInvoice: Stripe.Invoice): Promise<void> => {
  await syncSeatCountForInvoice(stripeInvoice, 'invoice.created');
};

export const invoiceDeliveryService = {
  sendInvoice,
  syncInvoice,
  voidInvoice,
  handleInvoiceUpcoming,
  handleInvoiceCreated,
} as const;
