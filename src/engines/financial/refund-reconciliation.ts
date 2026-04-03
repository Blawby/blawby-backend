import { getLogger } from '@logtape/logtape';
import { HTTPException } from 'hono/http-exception';
import { billingTransactionsRepository } from '@/modules/invoices/database/queries/billing-transactions.repository';
import { invoicesRepository } from '@/modules/invoices/database/queries/invoices.repository';
import { refundRequestsQueries } from '@/modules/invoices/database/queries/refund-requests.queries';
import { refundEngine } from '@/engines/financial/refund-engine';
import type { RefundEventPayload } from '@/engines/financial/types';
import { InvoiceRefunded } from '@/shared/events/definitions';

const logger = getLogger(['engines', 'financial', 'refund-reconciliation']);

const getStoredRefundEventPayload = (
  claimedReq: Awaited<ReturnType<typeof refundRequestsQueries.findById>>,
  invoiceTxs: Awaited<ReturnType<typeof billingTransactionsRepository.listByInvoiceId>>,
  organizationId: string
): RefundEventPayload | null => {
  if (!claimedReq) return null;

  const matchingRefundTx = invoiceTxs.find((tx) => {
    if (tx.type !== 'refund') return false;
    const metadata = tx.metadata as Record<string, unknown> | null | undefined;
    if (typeof metadata?.refund_request_id === 'string' && metadata.refund_request_id === claimedReq.id) return true;
    return (
      typeof claimedReq.stripe_refund_id === 'string' &&
      typeof metadata?.stripe_refund_id === 'string' &&
      metadata.stripe_refund_id === claimedReq.stripe_refund_id
    );
  });

  if (!matchingRefundTx) return null;

  const metadata = matchingRefundTx.metadata as Record<string, unknown> | null | undefined;
  const payoutFeeCreditCents =
    typeof metadata?.payout_fee_credit_cents === 'number'
      ? metadata.payout_fee_credit_cents
      : matchingRefundTx.metered_fee_cents;
  const creditInvoiceFee = typeof metadata?.credit_invoice_fee === 'boolean' ? metadata.credit_invoice_fee : false;

  return {
    invoice_id: claimedReq.invoice_id,
    organization_id: organizationId,
    refund_request_id: claimedReq.id,
    refunded_amount: claimedReq.executed_amount ?? matchingRefundTx.amount,
    payout_fee_credit_cents: payoutFeeCreditCents,
    credit_invoice_fee: creditInvoiceFee,
  };
};

/**
 * Reconcile a refund that may be stuck in 'executing' or already 'executed'.
 * - If 'executed': rebuild payload from stored data and re-dispatch InvoiceRefunded.
 * - If 'executing': re-run persistence (repair) then dispatch.
 * Throws for unexpected states. Used by the refund reconciliation worker task.
 */
const reconcileRefundExecution = async (opts: {
  organizationId: string;
  requestId: string;
  executorUserId: string;
  stripePaymentIntentId: string;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  refundedAmount: number;
}): Promise<{ repaired: boolean; dispatched: boolean }> => {
  const claimedReq = await refundRequestsQueries.findById(opts.requestId, opts.organizationId);
  if (!claimedReq) {
    throw new HTTPException(404, { message: 'Refund request not found for reconciliation' });
  }

  const invoice = await invoicesRepository.findInvoiceById(claimedReq.invoice_id, opts.organizationId);
  if (!invoice) {
    throw new HTTPException(404, { message: 'Invoice not found for reconciliation' });
  }

  const invoiceTxs = await billingTransactionsRepository.listByInvoiceId(invoice.id);

  let repaired = false;
  let refundEventPayload: RefundEventPayload | undefined = undefined;

  if (claimedReq.status === 'executed') {
    refundEventPayload =
      getStoredRefundEventPayload(claimedReq, invoiceTxs, opts.organizationId) ??
      (await refundEngine.buildRefundEventPayload({
        organizationId: opts.organizationId,
        claimedReq,
        invoice,
        invoiceTxs,
        refundedAmount: claimedReq.executed_amount ?? opts.refundedAmount,
      }));
  } else if (claimedReq.status === 'executing') {
    const persisted = await refundEngine.persistExecutedRefund({
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
      throw new Error('Refund reconciliation could not persist executed refund');
    }

    ({ refundEventPayload } = persisted);
    repaired = true;
  } else {
    throw new HTTPException(400, {
      message: `Refund request ${opts.requestId} is in unsupported status ${claimedReq.status} for reconciliation`,
    });
  }

  if (!refundEventPayload) {
    throw new Error('Failed to build or retrieve refund event payload');
  }

  try {
    await InvoiceRefunded.dispatch(refundEventPayload, {
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
    throw new Error('Refund reconciliation repaired local state but failed to dispatch refund event');
  }

  logger.info('Refund reconciliation completed for request {requestId}', {
    requestId: opts.requestId,
    organizationId: opts.organizationId,
    repaired,
    stripeRefundId: opts.stripeRefundId,
  });

  return { repaired, dispatched: true };
};

export const refundReconciliation = {
  reconcileRefundExecution,
};
