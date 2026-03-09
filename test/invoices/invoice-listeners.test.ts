import { test } from 'tap';

import { METERED_TYPES } from '@/modules/subscriptions/constants/meteredProducts';
import { reportMeteredUsageWithRetry } from '@/modules/invoices/listeners';
import { internalError, ok } from '@/shared/utils/result';

test('invoice listeners metered retry helper', async (t) => {
  await t.test('queues a retry job when metered usage reporting fails', async (t) => {
    const queued: Array<Record<string, unknown>> = [];
    let dispatched = false;

    await reportMeteredUsageWithRetry({
      organizationId: 'org_1',
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: 'inv_1',
      invoiceId: 'inv_1',
      failureLabel: 'invoice fee usage',
    }, {
      reportMeteredUsage: async () => internalError('stripe meter down'),
      queueMeteredUsageJob: async (payload) => {
        queued.push(payload as unknown as Record<string, unknown>);
      },
      dispatchSystemError: async () => {
        dispatched = true;
        return 'evt_1';
      },
    });

    t.equal(queued.length, 1);
    t.same(queued[0], {
      organizationId: 'org_1',
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: 'inv_1',
    });
    t.equal(dispatched, false);
  });

  await t.test('dispatches a system error when retry queueing fails too', async (t) => {
    const dispatched: Array<Record<string, unknown>> = [];

    await reportMeteredUsageWithRetry({
      organizationId: 'org_2',
      meteredType: METERED_TYPES.PAYOUT_FEE,
      quantity: -55,
      deduplicationId: 'refund:rr_1:payout_fee',
      invoiceId: 'inv_2',
      failureLabel: 'payout fee credit',
    }, {
      reportMeteredUsage: async () => internalError('meter failed'),
      queueMeteredUsageJob: async () => {
        throw new Error('queue failed');
      },
      dispatchSystemError: async (payload) => {
        dispatched.push(payload as Record<string, unknown>);
        return 'evt_2';
      },
    });

    t.equal(dispatched.length, 1);
    t.equal(dispatched[0].error, 'Failed to report metered usage and failed to queue retry');
    t.match(dispatched[0].context as Record<string, unknown>, {
      organizationId: 'org_2',
      invoiceId: 'inv_2',
      deduplicationId: 'refund:rr_1:payout_fee',
    });
  });

  await t.test('does nothing when metered usage succeeds', async (t) => {
    let queued = false;
    let dispatched = false;

    await reportMeteredUsageWithRetry({
      organizationId: 'org_3',
      meteredType: METERED_TYPES.INVOICE_FEE,
      quantity: 1,
      deduplicationId: 'inv_3',
      invoiceId: 'inv_3',
      failureLabel: 'invoice fee usage',
    }, {
      reportMeteredUsage: async () => ok(undefined),
      queueMeteredUsageJob: async () => {
        queued = true;
      },
      dispatchSystemError: async () => {
        dispatched = true;
        return 'evt_3';
      },
    });

    t.equal(queued, false);
    t.equal(dispatched, false);
  });
});
