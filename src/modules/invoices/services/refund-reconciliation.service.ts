import { getLogger } from '@logtape/logtape';

import { InvoiceRefunded } from '@/shared/events/definitions';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';
import { result } from '@/shared/utils/result';

import type { Result } from '@/shared/types/result';
import type { RefundEventPayload } from '@/modules/invoices/services/refund-execution-persistence.service';

const logger = getLogger(['invoices', 'refund-reconciliation']);

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
    refundEventPayload = await deps.buildRefundEventPayload({
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

  await deps.dispatchInvoiceRefunded(refundEventPayload, {
    actorId: opts.executorUserId,
    actorType: 'user',
    organizationId: opts.organizationId,
    critical: true,
  });

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
