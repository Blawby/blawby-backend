import { processWebhookRequest } from '@/modules/subscriptions/services/stripe-webhook.service';
import { config } from '@/shared/config';
import { queueManager } from '@/shared/queue/queue.manager';
import { stripeWebhookEventsRepository } from '@/shared/repositories/stripe.webhook-events.repository';
import { getStripeInstance } from '@/shared/utils/stripe-client';
import { HTTPException } from 'hono/http-exception';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/config', () => ({
  config: { stripe: { webhookSecret: 'whsec_test' } },
}));

vi.mock('@/shared/queue/queue.manager', () => ({
  queueManager: { addWebhookJob: vi.fn() },
}));

vi.mock('@/shared/repositories/stripe.webhook-events.repository', () => ({
  stripeWebhookEventsRepository: {
    createIfNotExists: vi.fn(),
    markFailed: vi.fn(),
  },
}));

vi.mock('@/shared/utils/stripe-client', () => ({
  getStripeInstance: vi.fn(),
}));

const addWebhookJobMock = vi.mocked(queueManager).addWebhookJob;
const createIfNotExistsMock = vi.mocked(stripeWebhookEventsRepository).createIfNotExists;
const markFailedMock = vi.mocked(stripeWebhookEventsRepository).markFailed;
const getStripeInstanceMock = vi.mocked(getStripeInstance);

const constructEventMock = vi.fn();

const makeStripeEvent = (type: string, id = 'evt_test_1') => ({ id, type });

beforeEach(() => {
  vi.clearAllMocks();
  getStripeInstanceMock.mockReturnValue({
    webhooks: { constructEvent: constructEventMock },
  } as unknown as ReturnType<typeof getStripeInstance>);
  createIfNotExistsMock.mockResolvedValue({ id: 'webhook_row_1' } as Awaited<ReturnType<typeof createIfNotExistsMock>>);
});

describe('processWebhookRequest', () => {
  it('throws when STRIPE_WEBHOOK_SECRET is not configured', async () => {
    (config.stripe as { webhookSecret: string | undefined }).webhookSecret = undefined;
    try {
      await expect(processWebhookRequest('body', 'sig')).rejects.toThrow('STRIPE_WEBHOOK_SECRET must be configured');
    } finally {
      (config.stripe as { webhookSecret: string | undefined }).webhookSecret = 'whsec_test';
    }
  });

  it('throws 400 when the Stripe-Signature header is missing', async () => {
    await expect(processWebhookRequest('body', null)).rejects.toThrow(HTTPException);
    expect(constructEventMock).not.toHaveBeenCalled();
  });

  it('throws 400 when signature verification fails', async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error('bad signature');
    });

    await expect(processWebhookRequest('body', 'sig')).rejects.toThrow(HTTPException);
    expect(createIfNotExistsMock).not.toHaveBeenCalled();
  });

  it('skips processing a duplicate event', async () => {
    constructEventMock.mockReturnValue(makeStripeEvent('product.created'));
    createIfNotExistsMock.mockResolvedValue(null);

    await processWebhookRequest('body', 'sig');

    expect(addWebhookJobMock).not.toHaveBeenCalled();
  });

  it('does not queue an event type outside the watched prefixes', async () => {
    constructEventMock.mockReturnValue(makeStripeEvent('payout.created'));

    await processWebhookRequest('body', 'sig');

    expect(addWebhookJobMock).not.toHaveBeenCalled();
  });

  it('queues a webhook job for a watched event type', async () => {
    constructEventMock.mockReturnValue(makeStripeEvent('customer.subscription.updated', 'evt_sub_1'));

    await processWebhookRequest('body', 'sig');

    expect(addWebhookJobMock).toHaveBeenCalledWith('webhook_row_1', 'evt_sub_1', 'customer.subscription.updated');
  });

  it('marks the event failed (without rethrowing) when queueing fails', async () => {
    constructEventMock.mockReturnValue(makeStripeEvent('checkout.session.completed', 'evt_checkout_1'));
    addWebhookJobMock.mockRejectedValue(new Error('queue down'));

    await expect(processWebhookRequest('body', 'sig')).resolves.toBeUndefined();
    expect(markFailedMock).toHaveBeenCalledWith('webhook_row_1', 'queue down');
  });

  it('swallows an error raised while marking the event failed', async () => {
    constructEventMock.mockReturnValue(makeStripeEvent('invoice.paid', 'evt_invoice_1'));
    addWebhookJobMock.mockRejectedValue(new Error('queue down'));
    markFailedMock.mockRejectedValue(new Error('db down'));

    await expect(processWebhookRequest('body', 'sig')).resolves.toBeUndefined();
  });
});
