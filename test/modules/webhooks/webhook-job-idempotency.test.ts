import { getWorkerUtils } from '@/shared/queue/graphile-worker.client';
import { queueManager } from '@/shared/queue/queue.manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/database', () => ({ db: {} }));
vi.mock('@/shared/queue/graphile-worker.client', () => ({
  getWorkerUtils: vi.fn(),
  closeWorkerUtils: vi.fn(),
}));

const getWorkerUtilsMock = vi.mocked(getWorkerUtils);
const addJob = vi.fn<Awaited<ReturnType<typeof getWorkerUtils>>['addJob']>();

beforeEach(() => {
  vi.clearAllMocks();
  getWorkerUtilsMock.mockResolvedValue({ addJob });
});

describe('Stripe webhook queue idempotency', () => {
  it('uses the Stripe event id as the stable Graphile job key', async () => {
    await queueManager.addWebhookJob('webhook-row-1', 'evt_invoice_paid_719', 'invoice.paid');
    await queueManager.addWebhookJob('webhook-row-1', 'evt_invoice_paid_719', 'invoice.paid');

    expect(addJob).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = addJob.mock.calls;
    expect(firstCall?.[0]).toBe('process-stripe-webhook');
    expect(firstCall?.[1]).toEqual({
      webhookId: 'webhook-row-1',
      eventId: 'evt_invoice_paid_719',
      eventType: 'invoice.paid',
    });
    expect(firstCall?.[2]?.jobKey).toBe('evt_invoice_paid_719');
    expect(typeof firstCall?.[2]?.maxAttempts).toBe('number');
    expect(secondCall?.[2]).toEqual(firstCall?.[2]);
  });
});
