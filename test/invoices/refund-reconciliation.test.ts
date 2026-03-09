import { test } from 'tap';

import { reconcileRefundExecution } from '@/modules/invoices/services/refund-reconciliation.service';

test('refund reconciliation service', async (t) => {
  await t.test('repairs an executing refund and dispatches InvoiceRefunded', async (t) => {
    const dispatched: Array<Record<string, unknown>> = [];

    const res = await reconcileRefundExecution({
      organizationId: 'org_1',
      requestId: 'rr_1',
      executorUserId: 'user_1',
      stripePaymentIntentId: 'pi_1',
      stripeTransferId: 'tr_1',
      stripeRefundId: 're_1',
      refundedAmount: 500,
    }, {
      findRefundRequestById: async () => ({
        id: 'rr_1',
        invoice_id: 'inv_1',
        status: 'executing',
        executed_amount: null,
        review_notes: null,
      } as never),
      findInvoiceById: async () => ({ id: 'inv_1' } as never),
      listBillingTransactionsByInvoiceId: async () => [],
      persistExecutedRefund: async () => ({
        updated: { id: 'rr_1', status: 'executed' } as never,
        refundEventPayload: {
          invoice_id: 'inv_1',
          organization_id: 'org_1',
          refund_request_id: 'rr_1',
          refunded_amount: 500,
          payout_fee_credit_cents: 40,
          credit_invoice_fee: false,
        },
      }),
      buildRefundEventPayload: async () => ({
        invoice_id: 'inv_1',
        organization_id: 'org_1',
        refund_request_id: 'rr_1',
        refunded_amount: 500,
        payout_fee_credit_cents: 40,
        credit_invoice_fee: false,
      }),
      dispatchInvoiceRefunded: async (payload) => {
        dispatched.push(payload as Record<string, unknown>);
        return 'evt_1';
      },
    });

    t.equal(res.success, true);
    if (res.success) {
      t.same(res.data, { repaired: true, dispatched: true });
    }
    t.equal(dispatched.length, 1);
  });

  await t.test('re-dispatches metered credit when refund is already executed', async (t) => {
    const dispatched: Array<Record<string, unknown>> = [];

    const res = await reconcileRefundExecution({
      organizationId: 'org_2',
      requestId: 'rr_2',
      executorUserId: 'user_2',
      stripePaymentIntentId: 'pi_2',
      stripeTransferId: null,
      stripeRefundId: 're_2',
      refundedAmount: 1500,
    }, {
      findRefundRequestById: async () => ({
        id: 'rr_2',
        invoice_id: 'inv_2',
        status: 'executed',
        executed_amount: 1500,
      } as never),
      findInvoiceById: async () => ({ id: 'inv_2' } as never),
      listBillingTransactionsByInvoiceId: async () => [],
      persistExecutedRefund: async () => ({ updated: null, refundEventPayload: null }),
      buildRefundEventPayload: async () => ({
        invoice_id: 'inv_2',
        organization_id: 'org_2',
        refund_request_id: 'rr_2',
        refunded_amount: 1500,
        payout_fee_credit_cents: 120,
        credit_invoice_fee: true,
      }),
      dispatchInvoiceRefunded: async (payload) => {
        dispatched.push(payload as Record<string, unknown>);
        return 'evt_2';
      },
    });

    t.equal(res.success, true);
    if (res.success) {
      t.same(res.data, { repaired: false, dispatched: true });
    }
    t.same(dispatched[0], {
      invoice_id: 'inv_2',
      organization_id: 'org_2',
      refund_request_id: 'rr_2',
      refunded_amount: 1500,
      payout_fee_credit_cents: 120,
      credit_invoice_fee: true,
    });
  });
});
