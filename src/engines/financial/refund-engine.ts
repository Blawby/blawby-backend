// Src/engines/financial/refund-engine.ts
import { getLogger } from '@logtape/logtape';
import type { ServiceContext } from '@/shared/types/service-context';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
// oxlint-disable-next-line import/no-namespace
import type * as schema from '@/schema';
import type { RefundEventPayload } from '@/engines/financial/types';

const logger = getLogger(['engines', 'financial', 'refund-engine']);

/**
 * Refund Engine — handles refund state machine, payout metering, and reconciliation
 *
 * Responsibilities:
 * - Persist executed refund state transitions
 * - Calculate payout fee credits (proportional to cumulative refunds)
 * - Reconcile stuck refunds (repair webhook failures)
 * - Build refund event payload for downstream processing
 */

interface PersistExecutedRefundOpts {
  organizationId: string;
  refundRequestId: string;
  invoiceId: string;
  refundedAmount: number;
  ctx: ServiceContext;
  tx: NodePgDatabase<typeof schema>;
}

const persistExecutedRefund = async (_opts: PersistExecutedRefundOpts): Promise<RefundEventPayload> => {
  logger.info('Persisting executed refund: {refundRequestId}', {
    refundRequestId: _opts.refundRequestId,
    invoiceId: _opts.invoiceId,
    amount: _opts.refundedAmount,
  });

  // TODO: Import and call refund-execution-persistence logic
  return {
    invoice_id: _opts.invoiceId,
    organization_id: _opts.organizationId,
    refund_request_id: _opts.refundRequestId,
    refunded_amount: _opts.refundedAmount,
    payout_fee_credit_cents: 0, // TODO: calculate
    credit_invoice_fee: false, // TODO: determine
  };
};

interface ReconcileRefundOpts {
  organizationId: string;
  refundRequestId: string;
  ctx?: ServiceContext;
  tx?: NodePgDatabase<typeof schema>;
}

const reconcileRefund = async (_opts: ReconcileRefundOpts): Promise<{ repaired: boolean; dispatched: boolean }> => {
  logger.info('Reconciling refund: {refundRequestId}', {
    refundRequestId: _opts.refundRequestId,
  });

  // TODO: Call refund-reconciliation logic
  return { repaired: false, dispatched: false };
};

const calculatePayoutFeeCreditCents = (_invoiceId: string, _amountPaidCents: number, _refundedAmount: number): number =>
  0;

/**
 * Refund Engine
 *
 * Usage:
 *   const payload = await RefundEngine.persistExecutedRefund({ organizationId, refundRequestId, ... });
 */
export const refundEngine = {
  persistExecutedRefund,
  reconcileRefund,
  calculatePayoutFeeCreditCents,
};
