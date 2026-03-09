import type { Task } from 'graphile-worker';

import { refundReconciliationService } from '@/modules/invoices/services/refund-reconciliation.service';

export const processRefundReconciliation: Task = async (payload, helpers): Promise<void> => {
  const {
    organizationId,
    requestId,
    executorUserId,
    stripePaymentIntentId,
    stripeTransferId,
    stripeRefundId,
    refundedAmount,
  } = (payload as {
    organizationId?: string;
    requestId?: string;
    executorUserId?: string;
    stripePaymentIntentId?: string;
    stripeTransferId?: string | null;
    stripeRefundId?: string | null;
    refundedAmount?: number;
  }) || {};

  if (!organizationId || !requestId || !executorUserId || !stripePaymentIntentId || typeof refundedAmount !== 'number') {
    helpers.logger.error('Invalid refund reconciliation payload', { payload });
    throw new Error('Invalid refund reconciliation payload');
  }

  const res = await refundReconciliationService.reconcileRefundExecution({
    organizationId,
    requestId,
    executorUserId,
    stripePaymentIntentId,
    stripeTransferId: stripeTransferId ?? null,
    stripeRefundId: stripeRefundId ?? null,
    refundedAmount,
  });

  if (!res.success) {
    const message = res.error?.message
      ?? (typeof res === 'object' ? JSON.stringify(res) : 'Refund reconciliation failed');
    throw new Error(message);
  }

  helpers.logger.info('Processed refund reconciliation job {requestId}', {
    requestId,
    organizationId,
    repaired: res.data.repaired,
  });
};
