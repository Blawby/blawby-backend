import { test } from 'tap';

type RefundStatus = 'requested' | 'approved' | 'rejected' | 'executed' | 'failed' | 'cancelled' | 'executing';

type RefundRequest = {
  id: string;
  invoice_id: string;
  status: RefundStatus;
  requested_amount: number;
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
  stripeRefundCreate: (params: Record<string, unknown>, options?: Record<string, unknown>) => Promise<{ id: string; amount: number }>;
  amount: number;
  paymentIntentId: string;
}) => {
  const claimed = await deps.transitionStatus('approved', { status: 'executing' });
  if (!claimed) return { success: false, error: { message: 'Only approved requests can be executed' } };

  try {
    const stripeRefund = await deps.stripeRefundCreate({
      payment_intent: deps.paymentIntentId,
      amount: deps.amount,
      reverse_transfer: true,
      refund_application_fee: true,
    });

    const executed = await deps.transitionStatus('executing', {
      status: 'executed',
      review_notes: claimed.review_notes ?? null,
    });

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

  await t.test('execute uses reverse_transfer/refund_application_fee and no stripeAccount', async (t) => {
    const calls: { params?: Record<string, unknown>; options?: Record<string, unknown> } = {};
    const transitions: Array<{ from: RefundStatus; status: RefundStatus }> = [];

    const res = await executeRefund({
      transitionStatus: async (from, patch) => {
        transitions.push({ from, status: patch.status });
        if (from === 'approved') {
          return { id: 'rr_1', invoice_id: 'inv_1', status: 'executing', requested_amount: 1500 };
        }
        return { id: 'rr_1', invoice_id: 'inv_1', status: patch.status, requested_amount: 1500 };
      },
      stripeRefundCreate: async (params, options) => {
        calls.params = params;
        calls.options = options;
        return { id: 're_1', amount: 1500 };
      },
      amount: 1500,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, true);
    t.equal(calls.params?.reverse_transfer, true);
    t.equal(calls.params?.refund_application_fee, true);
    t.equal(calls.options?.stripeAccount, undefined);
    t.same(transitions, [
      { from: 'approved', status: 'executing' },
      { from: 'executing', status: 'executed' },
    ]);
    if (res.success) t.equal(res.data.stripe_refund_id, 're_1');
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
      stripeRefundCreate: async () => {
        throw new Error('Stripe boom');
      },
      amount: 1500,
      paymentIntentId: 'pi_123',
    });

    t.equal(res.success, false);
    t.equal(failedNotes.length, 1);
    t.match(failedNotes[0], 'Stripe error: Stripe boom');
  });
});
