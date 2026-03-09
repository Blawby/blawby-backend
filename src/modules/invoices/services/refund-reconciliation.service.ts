import { getLogger } from '@logtape/logtape';

import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';

import type { RefundEventPayload } from '@/modules/invoices/services/refund-execution-persistence.service';
import { InvoiceRefunded } from '@/shared/events/definitions';
import type { Result } from '@/shared/types/result';
import { result } from '@/shared/utils/result';

const logger = getLogger(['invoices', 'refund-reconciliation']);

const getStoredRefundEventPayload = (
  claimedReq: Awaited<ReturnType<typeof refundRequestsQueries.findById>>,
  invoiceTxs: Awaited<ReturnType<typeof billingTransactionsRepository.listByInvoiceId>>,
  organizationId: string,
): RefundEventPayload | null => {
  if (!claimedReq) return null;

  const matchingRefundTx = invoiceTxs.find((tx) => {
    if (tx.type !== 'refund') return false;

    const metadata = tx.metadata as Record<string, unknown> | null | undefined;
    if (typeof metadata?.refund_request_id === 'string' && metadata.refund_request_id === claimedReq.id) {
      return true;
    }

    return typeof claimedReq.stripe_refund_id === 'string'
      && typeof metadata?.stripe_refund_id === 'string'
      && metadata.stripe_refund_id === claimedReq.stripe_refund_id;
  });

  if (!matchingRefundTx) return null;

  const metadata = matchingRefundTx.metadata as Record<string, unknown> | null | undefined;
  const payoutFeeCreditCents = typeof metadata?.payout_fee_credit_cents === 'number'
    ? metadata.payout_fee_credit_cents
    : matchingRefundTx.metered_fee_cents;
  const creditInvoiceFee = typeof metadata?.credit_invoice_fee === 'boolean'
    ? metadata.credit_invoice_fee
    : false;

  return {
    invoice_id: claimedReq.invoice_id,
    organization_id: organizationId,
    refund_request_id: claimedReq.id,
    refunded_amount: claimedReq.executed_amount ?? matchingRefundTx.amount,
    payout_fee_credit_cents: payoutFeeCreditCents,
    credit_invoice_fee: creditInvoiceFee,
  };
};

export const reconcileRefundExecution = async (opts: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
  stripePaymentIntentId: string;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  refundedAmount: number;
}, deps: {
  findRefundRequestById: typeof refundRequestsQueries.findById;
  findInvoiceById: typeof invoicesRepository.findInvoiceById;
  listBillingTransactionsByInvoiceId: typeof billingTransactionsRepository.listByInvoiceId;
  persistExecutedRefund: typeof refundExecutionPersistenceService.persistExecutedRefund;
  buildRefundEventPayload: typeof refundExecutionPersistenceService.buildRefundEventPayload;
  dispatchInvoiceRefunded: (payload: RefundEventPayload, options: {
    actorId: string;
    actorType: 'user';
    organizationId: string;
    critical: true;
  }) => string | Promise<string>;
} = {
  findRefundRequestById: refundRequestsQueries.findById,
  findInvoiceById: invoicesRepository.findInvoiceById,
  listBillingTransactionsByInvoiceId: billingTransactionsRepository.listByInvoiceId,
  persistExecutedRefund: refundExecutionPersistenceService.persistExecutedRefund,
  buildRefundEventPayload: refundExecutionPersistenceService.buildRefundEventPayload,
  dispatchInvoiceRefunded: (payload, options) => InvoiceRefunded.dispatch(payload, options),
}): Promise<Result<{ repaired: boolean; dispatched: boolean }>> => {
  const claimedReq = await deps.findRefundRequestById(opts.requestId, opts.organizationId);
  if (!claimedReq) {
    return result.notFound('Refund request not found for reconciliation');
  }

  const invoice = await deps.findInvoiceById(claimedReq.invoice_id, opts.organizationId);
  if (!invoice) {
    return result.notFound('Invoice not found for reconciliation');
  }

  const invoiceTxs = await deps.listBillingTransactionsByInvoiceId(invoice.id);

  let repaired = false;
  let refundEventPayload;

  if (claimedReq.status === 'executed') {
    refundEventPayload = getStoredRefundEventPayload(claimedReq, invoiceTxs, opts.organizationId)
      ?? await deps.buildRefundEventPayload({
        organizationId: opts.organizationId,
        claimedReq,
        invoice,
        invoiceTxs,
        refundedAmount: claimedReq.executed_amount ?? opts.refundedAmount,
      });
  } else if (claimedReq.status === 'executing') {
    const persisted = await deps.persistExecutedRefund({
      organizationId: opts.organizationId,
      requestId: opts.requestId,
      executorUserId: opts.executorUserId,
      claimedReq,
      invoice,
      invoiceTxs,
      stripePaymentIntentId: opts.stripePaymentIntentId,
      stripeTransferId: opts.stripeTransferId,
      stripeRefundId: opts.stripeRefundId,
      refundedAmount: opts.refundedAmount,
      refundNotes: claimedReq.review_notes,
    });

    if (!persisted.updated || !persisted.refundEventPayload) {
      return result.internalError('Refund reconciliation could not persist executed refund');
    }

    refundEventPayload = persisted.refundEventPayload;
    repaired = true;
  } else {
    return result.badRequest(`Refund request ${opts.requestId} is in unsupported status ${claimedReq.status} for reconciliation`);
  }

  try {
    await deps.dispatchInvoiceRefunded(refundEventPayload, {
      actorId: opts.executorUserId,
      actorType: 'user',
      organizationId: opts.organizationId,
      critical: true,
    });
  } catch (error) {
    logger.error('Failed to dispatch InvoiceRefunded during refund reconciliation', {
      actorId: opts.executorUserId,
      organizationId: opts.organizationId,
      refundRequestId: claimedReq.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return result.internalError('Refund reconciliation repaired local state but failed to dispatch refund event');
  }

  logger.info('Refund reconciliation completed for request {requestId}', {
    requestId: opts.requestId,
    organizationId: opts.organizationId,
    repaired,
    stripeRefundId: opts.stripeRefundId,
  });

  return result.ok({ repaired, dispatched: true });
};

export const refundReconciliationService = {
  reconcileRefundExecution,
};
