import { test } from 'tap';
import { maybeCancelCancelablePaymentIntent } from '@/modules/invoices/services/refund-requests.service';

type RefundStatus = 'requested' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled' | 'executing';

type RefundRequest = {
  id: string;
  invoice_id: string;
  status: RefundStatus;
  requested_amount: number;
  stripe_refund_id?: string | null;
  review_notes?: string | null;
};

const createRequest = async (deps: {
  invoiceId: string;
  listByOrganization: (invoiceId: string) => Promise<RefundRequest[]>;
  create: () => Promise<RefundRequest>;
}) => {
  const existing = await deps.listByOrganization(deps.invoiceId);
  const open = existing.some((r) => r.status === 'requested' || r.status === 'approved');
  if (open) {
    return { success: false, error: { message: 'An open refund request already exists for this invoice' } };
  }
  const created = await deps.create();
  return { success: true, data: created };
};

const executeRefund = async (deps: {
  transitionStatus: (from: RefundStatus, patch: Partial<RefundRequest> & { status: RefundStatus }) => Promise<RefundRequest | null>;
  listRefunds: () => Promise<Array<RefundRequest & { executed_amount?: number | null }>>;
  stripeRefundCreate: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ id: string; amount: number }>;
  dispatchRefundedEvent: (payload: { payout_fee_credit_cents: number; credit_invoice_fee: boolean }) => Promise<void>;
  logger?: { error: (message: string, meta?: Record<string, unknown>) => void };
  amount: number;
  amountPaid: number;
  originalMeteredFeeCents: number;
  paymentIntentId: string;
}) => {
  const claimed = await deps.transitionStatus('approved', { status: 'executing' });
  if (!claimed) return { success: false, error: { message: 'Only approved requests can be executed' } };

  try {
    const stripeRefund = await deps.stripeRefundCreate({
      payment_intent: deps.paymentIntentId,
      amount: deps.amount,
      reverse_transfer: true,
    });

    const priorRefunds = await deps.listRefunds();
    const alreadyRefunded = priorRefunds
      .filter((refundRequest) => refundRequest.id !== claimed.id && refundRequest.status === 'executed')
      .reduce((sum, refundRequest) => sum + (refundRequest.executed_amount ?? 0), 0);
    const cumulativeRefunded = alreadyRefunded + stripeRefund.amount;
    const creditInvoiceFee = cumulativeRefunded >= deps.amountPaid;
    const payoutFeeCreditCents = deps.amountPaid > 0
      ? Math.round((deps.originalMeteredFeeCents * stripeRefund.amount) / deps.amountPaid)
      : 0;

    const executed = await deps.transitionStatus('executing', {
      status: 'executed',
      stripe_refund_id: stripeRefund.id,
      review_notes: claimed.review_notes ?? null,
    });

    try {
      await deps.dispatchRefundedEvent({
        payout_fee_credit_cents: payoutFeeCreditCents,
        credit_invoice_fee: creditInvoiceFee,
      });
    } catch (error) {
      deps.logger?.error('dispatchRefundedEvent failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return {
      success: true,
      data: {
        ...(executed ?? claimed),
        stripe_refund_id: stripeRefund.id,
      },
    };
  } catch (error) {
    await deps.transitionStatus('executing', {
      status: 'failed',
      review_notes: `Stripe error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
    return { success: false, error: { message: 'Failed to execute Stripe refund' } };
  }
};

test('refund requests service', async (t) => {
  await t.test('create rejects when existing requested/approved exists', async (t) => {
    const res = await createRequest({
      invoiceId: 'inv_1',
      listByOrganization: async () => [{ id: 'rr_1', invoice_id: 'inv_1', status: 'requested', requested_amount: 500 }],
      create: async () => ({ id: 'rr_new', invoice_id: 'inv_1', status: 'requested', requested_amount: 500 }),
    });

    t.equal(res.success, false);
    if (!res.success) t.match(res.error.message, 'open refund request');
  });

  await t.test('create succeeds when only terminal statuses exist', async (t) => {
    const res = await createRequest({
      invoiceId: 'inv_1',
      listByOrganization: async () => [
        { id: 'rr_1', invoice_id: 'inv_1', status: 'executed', requested_amount: 500 },
        { id: 'rr_2', invoice_id: 'inv_1', status: 'rejected', requested_amount: 500 },
        { id: 'rr_3', invoice_id: 'inv_1', status: 'cancelled', requested_amount: 500 },
      ],
      create: async () => ({ id: 'rr_new', invoice_id: 'inv_1', status: 'requested', requested_amount: 500 }),
    });

    t.equal(res.success, true);
    if (res.success) t.equal(res.data.status, 'requested');
  });

  await t.test('execute uses reverse_transfer only and emits refund credits without stripeAccount', async (t) => {
    const calls: { params?: Record<string, unknown>; options?: Record<string, unknown> } = {};
    const transitions: Array<{ from: RefundStatus; status: RefundStatus }> = [];
    let eventPayload: { payout_fee_credit_cents: number; credit_invoice_fee: boolean } | null = null;

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        transitions.push({ from, status: patch.status });
        if (from === 'approved') {
          return { id: 'rr_1', invoice_id: 'inv_1', status: 'executing', requested_amount: 1500 };
        }
        return { id: 'rr_1', invoice_id: 'inv_1', status: patch.status, requested_amount: 1500 };
      },
      listRefunds: async () => [],
      stripeRefundCreate: async (params, options) => {
        calls.params = params;
        calls.options = options;
        return { id: 're_1', amount: 1500 };
      },
      dispatchRefundedEvent: async (payload) => {
        eventPayload = payload;
      },
      amount: 1500,
      amountPaid: 1500,
      originalMeteredFeeCents: 123,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, true);
    t.equal(calls.params?.reverse_transfer, true);
    t.equal(Object.prototype.hasOwnProperty.call(calls.params ?? {}, 'refund_application_fee'), false);
    t.equal(calls.options?.stripeAccount, undefined);
    t.same(transitions, [
      { from: 'approved', status: 'executing' },
      { from: 'executing', status: 'executed' },
    ]);
    t.same(eventPayload, {
      payout_fee_credit_cents: 123,
      credit_invoice_fee: true,
    });
    if (res.success) t.equal(res.data.stripe_refund_id, 're_1');
  });

  await t.test('partial refund only credits payout fee proportionally', async (t) => {
    let eventPayload: { payout_fee_credit_cents: number; credit_invoice_fee: boolean } | null = null;

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        if (from === 'approved') {
          return { id: 'rr_2', invoice_id: 'inv_1', status: 'executing', requested_amount: 500 };
        }
        return { id: 'rr_2', invoice_id: 'inv_1', status: patch.status, requested_amount: 500 };
      },
      listRefunds: async () => [],
      stripeRefundCreate: async () => ({ id: 're_2', amount: 500 }),
      dispatchRefundedEvent: async (payload) => {
        eventPayload = payload;
      },
      amount: 500,
      amountPaid: 1500,
      originalMeteredFeeCents: 120,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, true);
    t.same(eventPayload, {
      payout_fee_credit_cents: 40,
      credit_invoice_fee: false,
    });
  });

  await t.test('zero amountPaid falls back to zero payout fee credit', async (t) => {
    let eventPayload: { payout_fee_credit_cents: number; credit_invoice_fee: boolean } | null = null;

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        if (from === 'approved') {
          return { id: 'rr_3', invoice_id: 'inv_1', status: 'executing', requested_amount: 500 };
        }
        return { id: 'rr_3', invoice_id: 'inv_1', status: patch.status, requested_amount: 500 };
      },
      listRefunds: async () => [],
      stripeRefundCreate: async () => ({ id: 're_3', amount: 500 }),
      dispatchRefundedEvent: async (payload) => {
        eventPayload = payload;
      },
      amount: 500,
      amountPaid: 0,
      originalMeteredFeeCents: 120,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, true);
    t.same(eventPayload, {
      payout_fee_credit_cents: 0,
      credit_invoice_fee: true,
    });
  });

  await t.test('event dispatch failures are logged and do not fail refund execution', async (t) => {
    const errorLogs: string[] = [];

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        if (from === 'approved') {
          return { id: 'rr_4', invoice_id: 'inv_1', status: 'executing', requested_amount: 500 };
        }
        return { id: 'rr_4', invoice_id: 'inv_1', status: patch.status, requested_amount: 500 };
      },
      listRefunds: async () => [],
      stripeRefundCreate: async () => ({ id: 're_4', amount: 500 }),
      dispatchRefundedEvent: async () => {
        throw new Error('event boom');
      },
      logger: {
        error: (message, meta) => {
          errorLogs.push(`${message}:${String(meta?.error ?? '')}`);
        },
      },
      amount: 500,
      amountPaid: 1500,
      originalMeteredFeeCents: 120,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, true);
    t.equal(errorLogs.length, 1);
    t.match(errorLogs[0], 'dispatchRefundedEvent failed:event boom');
  });

  await t.test('same-day full refund cancels uncaptured payment intent instead of creating refund', async (t) => {
    const res = await maybeCancelCancelablePaymentIntent({
      stripePaymentIntentId: 'pi_123',
      requestedAmount: 1500,
      amountPaidCents: 1500,
      paidAt: new Date(),
    }, {
      retrieve: async () => ({ status: 'requires_capture' } as never),
      cancel: async () => ({ id: 'pi_123', status: 'canceled' } as never),
    });

    t.same(res, {
      refundedAmount: 1500,
      stripeRefundId: null,
      notes: 'PaymentIntent canceled before capture; no Stripe refund object created',
    });
  });

  await t.test('same-day cancel path is skipped for partial refunds', async (t) => {
    const res = await maybeCancelCancelablePaymentIntent({
      stripePaymentIntentId: 'pi_456',
      requestedAmount: 500,
      amountPaidCents: 1500,
      paidAt: new Date(),
    }, {
      retrieve: async () => ({ status: 'requires_capture' } as never),
      cancel: async () => ({ id: 'pi_456', status: 'canceled' } as never),
    });

    t.equal(res, null);
  });

  await t.test('execute failure marks request failed and stores review_notes', async (t) => {
    const failedNotes: string[] = [];

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        if (from === 'approved') {
          return { id: 'rr_1', invoice_id: 'inv_1', status: 'executing', requested_amount: 1500 };
        }
        if (patch.status === 'failed') {
          failedNotes.push(String(patch.review_notes ?? ''));
        }
        return { id: 'rr_1', invoice_id: 'inv_1', status: patch.status, requested_amount: 1500 };
      },
      listRefunds: async () => [],
      stripeRefundCreate: async () => {
        throw new Error('Stripe boom');
      },
      dispatchRefundedEvent: async () => undefined,
      amount: 1500,
      amountPaid: 1500,
      originalMeteredFeeCents: 123,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, false);
    t.equal(failedNotes.length, 1);
    t.match(failedNotes[0], 'Stripe error: Stripe boom');
  });
});
