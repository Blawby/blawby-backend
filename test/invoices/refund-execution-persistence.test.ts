import { test } from 'tap';

import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';

test('refund execution persistence payout fee credit math', async (t) => {
  await t.test('uses cumulative refunded amount to avoid rounding drift', async (t) => {
    const invoiceTxs = [
      {
        type: 'payout',
        amount: 1000,
        metered_fee_cents: 100,
        metadata: null,
      },
      {
        type: 'refund',
        amount: 333,
        metered_fee_cents: 33,
        metadata: {
          refund_request_id: 'rr_1',
          payout_fee_credit_cents: 33,
        },
      },
    ] as never;

    const payoutFeeCreditCents = refundExecutionPersistenceService.calculatePayoutFeeCreditCents(
      1000,
      333,
      invoiceTxs,
      'rr_2',
    );

    t.equal(payoutFeeCreditCents, 34);
  });

  await t.test('ignores the current refund transaction when rebuilding an executed refund payload', async (t) => {
    const invoiceTxs = [
      {
        type: 'payout',
        amount: 1500,
        metered_fee_cents: 120,
        metadata: null,
      },
      {
        type: 'refund',
        amount: 500,
        metered_fee_cents: 40,
        metadata: {
          refund_request_id: 'rr_current',
          payout_fee_credit_cents: 40,
        },
      },
    ] as never;

    const payoutFeeCreditCents = refundExecutionPersistenceService.calculatePayoutFeeCreditCents(
      1500,
      500,
      invoiceTxs,
      'rr_current',
    );

    t.equal(payoutFeeCreditCents, 40);
  });
});
