import { test } from 'tap';

import type { SelectBillingTransaction } from '@/modules/invoices/database/schema/billing-transactions.schema';
import { refundExecutionPersistenceService } from '@/modules/invoices/services/refund-execution-persistence.service';

const createBillingTransactionFixture = (
  overrides: Partial<SelectBillingTransaction>,
): SelectBillingTransaction => ({
  id: 'bt_fixture',
  organization_id: 'org_fixture',
  invoice_id: 'inv_fixture',
  matter_id: null,
  stripe_transfer_id: null,
  destination_account_id: 'acct_fixture',
  amount: 0,
  metered_fee_cents: 0,
  type: 'payout',
  status: 'completed',
  retry_count: 0,
  last_error: null,
  metadata: null,
  created_at: new Date('2026-03-01T00:00:00.000Z'),
  completed_at: null,
  ...overrides,
});

test('refund execution persistence payout fee credit math', async (t) => {
  await t.test('uses cumulative refunded amount to avoid rounding drift', async (t) => {
    const invoiceTxs = [
      createBillingTransactionFixture({
        type: 'payout',
        amount: 1000,
        metered_fee_cents: 100,
        metadata: null,
      }),
      createBillingTransactionFixture({
        id: 'bt_refund_1',
        type: 'refund',
        amount: 333,
        metered_fee_cents: 33,
        metadata: {
          refund_request_id: 'rr_1',
          payout_fee_credit_cents: 33,
        },
      }),
    ];

    const payoutFeeCreditCents = refundExecutionPersistenceService.calculatePayoutFeeCreditCents(
      'inv_fixture',
      1000,
      333,
      invoiceTxs,
      'rr_2',
    );

    t.equal(payoutFeeCreditCents, 34);
  });

  await t.test('ignores the current refund transaction when rebuilding an executed refund payload', async (t) => {
    const invoiceTxs = [
      createBillingTransactionFixture({
        type: 'payout',
        amount: 1500,
        metered_fee_cents: 120,
        metadata: null,
      }),
      createBillingTransactionFixture({
        id: 'bt_refund_current',
        type: 'refund',
        amount: 500,
        metered_fee_cents: 40,
        metadata: {
          refund_request_id: 'rr_current',
          payout_fee_credit_cents: 40,
        },
      }),
    ];

    const payoutFeeCreditCents = refundExecutionPersistenceService.calculatePayoutFeeCreditCents(
      'inv_fixture',
      1500,
      500,
      invoiceTxs,
      'rr_current',
    );

    t.equal(payoutFeeCreditCents, 40);
  });
});
