import {
  onboardingWebhooksService,
  WebhookVerificationError,
} from '@/modules/webhooks/services/onboarding-webhooks.service';
import type { WebhookEvent } from '@/shared/schemas/stripe.webhook-events.schema';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn<(body: string | Buffer, signature: string, secret: string) => Stripe.Event>(),
  createIfNotExists:
    vi.fn<(event: Stripe.Event, headers: Record<string, string>, url: string) => Promise<WebhookEvent | null>>(),
  existsByStripeEventId: vi.fn<(eventId: string) => Promise<WebhookEvent | null>>(),
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@logtape/logtape', () => ({ getLogger: () => mocks.logger }));
vi.mock('@/modules/onboarding/handlers/index', () => ({ default: {} }));
vi.mock('@/shared/queue/queue.manager', () => ({ queueManager: { addOnboardingWebhookJob: vi.fn() } }));
vi.mock('@/shared/utils/stripe-client', () => ({ stripe: { webhooks: { constructEvent: mocks.constructEvent } } }));
vi.mock('@/shared/repositories/stripe.webhook-events.repository', () => ({
  stripeWebhookEventsRepository: {
    createIfNotExists: mocks.createIfNotExists,
    existsByStripeEventId: mocks.existsByStripeEventId,
  },
}));

const event = {
  id: 'evt_invoice_paid_719',
  object: 'event',
  api_version: '2026-06-30.basil',
  created: 0,
  data: { object: {} },
  livemode: false,
  pending_webhooks: 1,
  request: null,
  type: 'invoice.paid',
} satisfies Stripe.Event;

const storedEvent = {
  id: 'webhook-719',
  stripeEventId: event.id,
  eventType: event.type,
  processed: true,
  processedAt: new Date('2026-07-12T00:00:00Z'),
  error: null,
  errorStack: null,
  retryCount: 0,
  maxRetries: 3,
  nextRetryAt: null,
  payload: event,
  headers: {},
  url: 'https://api.blawby.com/api/webhooks/stripe/account',
  createdAt: new Date('2026-07-12T00:00:00Z'),
} satisfies WebhookEvent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('financial webhook verification and replay safety', () => {
  it('rejects an invalid signature before storing or processing an event', async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error('signature mismatch with sensitive detail');
    });

    await expect(
      onboardingWebhooksService.verifyAndStoreWithSecret(
        'raw-body',
        'invalid-signature',
        {},
        storedEvent.url,
        'whsec_test'
      )
    ).rejects.toEqual(new WebhookVerificationError('Invalid signature', 400));

    expect(mocks.createIfNotExists).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith('Invalid webhook signature received for {webhookPath}', {
      webhookPath: '/api/webhooks/stripe/account',
    });
    expect(JSON.stringify(mocks.logger.warn.mock.calls)).not.toContain('sensitive detail');
  });

  it('recognizes a replayed processed event without creating a second event', async () => {
    mocks.constructEvent.mockReturnValue(event);
    mocks.createIfNotExists.mockResolvedValue(null);
    mocks.existsByStripeEventId.mockResolvedValue(storedEvent);

    await expect(
      onboardingWebhooksService.verifyAndStoreWithSecret(
        'raw-body',
        'valid-signature',
        {},
        storedEvent.url,
        'whsec_test'
      )
    ).resolves.toEqual({ event, alreadyProcessed: true });

    expect(mocks.createIfNotExists).toHaveBeenCalledOnce();
    expect(mocks.existsByStripeEventId).toHaveBeenCalledWith(event.id);
  });
});
