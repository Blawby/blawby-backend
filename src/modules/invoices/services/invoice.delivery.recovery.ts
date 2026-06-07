import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import type { InvoiceWithRelations } from '@/modules/invoices/types/invoices.types';
import { SystemErrorOccurred } from '@/shared/events/definitions';
import { addInvoiceVoidReconciliationJob } from '@/shared/queue/queue.manager';
import type { ServiceContext } from '@/shared/types/service-context';
import { getLogger } from '@logtape/logtape';
import type { Stripe } from 'stripe';

const logger = getLogger(['invoices', 'delivery-helpers']);

const statusMap = Object.freeze({
  draft: 'draft',
  open: 'sent',
  paid: 'paid',
  uncollectible: 'overdue',
  void: 'cancelled',
} as const);

export const enqueueVoidReconciliation = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
}: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
}): Promise<void> => {
  try {
    await addInvoiceVoidReconciliationJob({
      invoiceId,
      organizationId,
      stripeInvoiceId,
    });
  } catch (queueError) {
    logger.error('Failed to queue invoice void reconciliation job: {error}', {
      invoiceId,
      organizationId,
      stripeInvoiceId,
      error: queueError instanceof Error ? queueError.message : 'Unknown error',
    });
  }
};

export const dispatchVoidSystemError = async ({
  invoiceId,
  organizationId,
  stripeInvoiceId,
}: {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
}): Promise<void> => {
  await SystemErrorOccurred.dispatch(
    {
      error: 'Invoice marked cancelled but Stripe void failed',
      context: {
        invoiceId,
        organizationId,
        stripeInvoiceId,
        recovery: 'Re-run invoice void reconciliation against Stripe',
      },
    },
    {
      actorId: 'system',
      actorType: 'system',
      organizationId,
    }
  );
};

export const syncStripeState = async (
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
  const stripeStatus = stripeInvoice.status;
  const mappedStatus =
    stripeStatus && stripeStatus in statusMap
      ? statusMap[stripeStatus as keyof typeof statusMap]
      : currentInvoice.status;

  await invoicesRepository.updateInvoice(invoiceId, ctx.organizationId, {
    status: mappedStatus,
    amount_paid: stripeInvoice.amount_paid,
    amount_due: stripeInvoice.amount_remaining,
    paid_at: stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : null,
  });

  return await invoicesRepository.findInvoiceById(invoiceId, ctx.organizationId);
};
