import { getLogger } from '@logtape/logtape';
import type { Task } from 'graphile-worker';
import { stripeApiAdapter } from '@/engines/stripe/stripe-api-adapter';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';

const logger = getLogger(['workers', 'tasks', 'process-invoice-void-reconciliation']);

interface ProcessInvoiceVoidReconciliationPayload {
  invoiceId: string;
  organizationId: string;
  stripeInvoiceId: string;
}

const isPayload = (payload: unknown): payload is ProcessInvoiceVoidReconciliationPayload => {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  return (
    typeof candidate.invoiceId === 'string' &&
    typeof candidate.organizationId === 'string' &&
    typeof candidate.stripeInvoiceId === 'string'
  );
};

export const processInvoiceVoidReconciliation: Task = async (payload: unknown) => {
  if (!isPayload(payload)) {
    throw new Error('Invalid processInvoiceVoidReconciliation payload');
  }

  const invoice = await invoicesRepository.findInvoiceById(payload.invoiceId, payload.organizationId);
  if (!invoice) {
    logger.warn('Invoice void reconciliation skipped; invoice not found: {invoiceId}', {
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
      stripeInvoiceId: payload.stripeInvoiceId,
    });
    return;
  }

  if (invoice.status !== 'cancelled') {
    logger.warn('Invoice void reconciliation skipped; invoice is no longer cancelled: {invoiceId}', {
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
      status: invoice.status,
      stripeInvoiceId: payload.stripeInvoiceId,
    });
    return;
  }

  if (invoice.stripe_invoice_id !== payload.stripeInvoiceId) {
    logger.warn('Invoice void reconciliation skipped; Stripe invoice ID mismatch: {invoiceId}', {
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
      expectedStripeInvoiceId: invoice.stripe_invoice_id,
      receivedStripeInvoiceId: payload.stripeInvoiceId,
    });
    return;
  }

  const stripeInvoice = await stripeApiAdapter.getStripeInvoice(payload.stripeInvoiceId);
  if (stripeInvoice.status === 'void') {
    logger.info('Invoice void reconciliation skipped; Stripe invoice already void: {invoiceId}', {
      invoiceId: payload.invoiceId,
      organizationId: payload.organizationId,
      stripeInvoiceId: payload.stripeInvoiceId,
    });
    return;
  }

  await stripeApiAdapter.voidInvoice(payload.stripeInvoiceId);

  logger.info('Invoice void reconciliation succeeded: {invoiceId}', {
    invoiceId: payload.invoiceId,
    organizationId: payload.organizationId,
    stripeInvoiceId: payload.stripeInvoiceId,
  });
};
